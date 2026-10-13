import {McpServer,ResourceTemplate} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ErrorCode,McpError,type CallToolResult,type ReadResourceResult} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import {Store} from './store.js';
import {workId,chapterNumber,draftInput,workOutput,chapterOutput,LabError} from './schemas.js';

const dbPath=process.argv[2];
if(!dbPath)throw new Error('需要数据库路径。');
const taskId=process.argv[3]??null;
const store=new Store(dbPath);
const server=new McpServer({name:'novel-lab',version:'0.1.0'},{instructions:'先读取当前作品要求及正文，依据返回的修订保存草稿；保存后读回。这里不提供人工采用能力。'});
const readAnnotations={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
const result=(action:()=>unknown):CallToolResult=>{
  try{const data=action();const structuredContent={result:data};return {structuredContent,content:[{type:'text',text:JSON.stringify(structuredContent)}]};}
  catch(error){
    const failure={code:error instanceof LabError?error.code:'STORE_ERROR',message:error instanceof Error?error.message:String(error)};
    console.error(JSON.stringify({toolError:failure}));
    return {isError:true,content:[{type:'text',text:JSON.stringify(failure)}]};
  }
};
server.registerTool('read_work',{title:'读取当前作品要求',description:'取得有效用途、设定、大纲及要求修订；写作和保存前先调用。',inputSchema:{workId},outputSchema:{result:workOutput},annotations:readAnnotations},({workId})=>result(()=>store.getWork(workId)));
server.registerTool('list_chapters',{title:'查询已保存章节',description:'查询真实保存数量、各章修订和人工采用状态，不包含正文。',inputSchema:{workId},outputSchema:{result:z.object({chapters:z.array(chapterOutput.omit({body:true}))})},annotations:readAnnotations},({workId})=>result(()=>({chapters:store.listChapters(workId)})));
server.registerTool('read_chapter',{title:'读回完整章节',description:'取得一章的当前正文和修订；不存在时 result 为 null。保存后用它核对实际内容。',inputSchema:{workId,chapterNumber},outputSchema:{result:chapterOutput.nullable()},annotations:readAnnotations},({workId,chapterNumber})=>result(()=>store.getChapter(workId,chapterNumber)));
server.registerTool('save_draft',{title:'保存章节草稿',description:'按当前要求、正文和前文基线保存草稿。expectedPreviousRevisions 逐项列出第1章至上一章的修订，写第1章时为 []。没有旧正文时 expectedChapterRevision=0。状态始终 draft；冲突时重读，不重试旧基线。',inputSchema:draftInput.shape,outputSchema:{result:chapterOutput},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}},input=>result(()=>store.saveDraft(input,'agent',taskId)));

const workUri=(id:string)=>`novel://works/${id}/requirements`;
const chapterUri=(id:string,number:number)=>`novel://works/${id}/chapters/${number}`;
const resourceResult=(uri:URL,action:()=>unknown):ReadResourceResult=>{
  try{return {contents:[{uri:uri.href,mimeType:'application/json',text:JSON.stringify(action())}]};}
  catch(error){
    if(error instanceof z.ZodError)throw new McpError(ErrorCode.InvalidParams,'资源地址参数不符合格式。');
    if(error instanceof LabError)throw new McpError(-32002,error.message,{uri:uri.href,code:error.code});
    throw error;
  }
};
server.registerResource('work_requirements',new ResourceTemplate('novel://works/{workId}/requirements',{list:()=>({resources:store.listWorks().map(work=>({name:`${work.id}-requirements`,uri:workUri(work.id),title:work.title,mimeType:'application/json'}))})}),{title:'当前作品要求',description:'读取时取得数据库当前资料；目录或此前读取不代替本次有效修订。',mimeType:'application/json'},(uri,variables)=>resourceResult(uri,()=>store.getWork(workId.parse(variables.workId))));
server.registerResource('chapter_text',new ResourceTemplate('novel://works/{workId}/chapters/{chapterNumber}',{list:()=>({resources:store.listWorks().flatMap(work=>store.listChapters(work.id).map(chapter=>({name:`${work.id}-chapter-${chapter.number}`,uri:chapterUri(work.id,chapter.number),title:`第 ${chapter.number} 章 ${chapter.title}`,mimeType:'application/json'})))})}),{title:'当前章节正文',description:'读取已保存正文、修订及状态；不存在的章不是空白已完成稿。',mimeType:'application/json'},(uri,variables)=>resourceResult(uri,()=>{
  const chapter=store.getChapter(workId.parse(variables.workId),chapterNumber.parse(Number(variables.chapterNumber)));
  if(!chapter)throw new LabError('CHAPTER_NOT_FOUND','该章正文尚未保存。');
  return chapter;
}));
server.registerPrompt('review_chapter',{title:'检查一章的依据与表现',description:'由人选择检查对象；取得当前资料、正文和检查方法，不运行模型、不改变稿件状态。',argsSchema:{workId,chapterNumber:z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(chapterNumber)}},({workId,chapterNumber})=>{
  const work=store.getWork(workId),chapter=store.getChapter(workId,chapterNumber);
  if(!chapter)throw new McpError(-32002,'该章正文尚未保存。');
  const previous=store.listChapters(workId).filter(item=>item.number<chapterNumber).map(item=>store.getChapter(workId,item.number)!);
  const documents=[{uri:workUri(workId),data:work},...previous.map(data=>({uri:chapterUri(workId,data.number),data})),{uri:chapterUri(workId,chapterNumber),data:chapter}];
  return {description:`检查 ${work.title} 第 ${chapterNumber} 章 r${chapter.revision} 的当前快照`,messages:[
    {role:'user',content:{type:'text',text:`请检查作品 ${workId} 的第 ${chapterNumber} 章。先核对目标、资料修订、前文修订和保存状态，再对照每条关键设定与原文具体句子，区分确定矛盾、可能问题和资料未说明的情况。表达与创作取舍请给具体阅读理由，不能以模型自评分代替人的判断。只提出检查结果和仍待人决定的事项，不保存、不采用。下面是本次取得的资料快照；业务状态以后可能变化，准备修改时必须重读。`}},
    ...documents.map(document=>({role:'user' as const,content:{type:'resource' as const,resource:{uri:document.uri,mimeType:'application/json',text:JSON.stringify(document.data)}}}))
  ]};
});
const transport=new StdioServerTransport();
transport.onclose=()=>store.close();
await server.connect(transport);
process.stdin.once('end',()=>server.close());
