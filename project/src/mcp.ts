import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import {Store} from './store.js';
import {workId,chapterNumber,draftInput,LabError} from './schemas.js';

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
server.registerTool('read_work',{title:'读取当前作品要求',description:'取得有效用途、设定、大纲及要求修订；写作和保存前先调用。',inputSchema:{workId},annotations:readAnnotations},({workId})=>result(()=>store.getWork(workId)));
server.registerTool('list_chapters',{title:'查询已保存章节',description:'查询真实保存数量、各章修订和人工采用状态，不包含正文。',inputSchema:{workId},annotations:readAnnotations},({workId})=>result(()=>({chapters:store.listChapters(workId)})));
server.registerTool('read_chapter',{title:'读回完整章节',description:'取得一章的当前正文和修订；不存在时 result 为 null。保存后用它核对实际内容。',inputSchema:{workId,chapterNumber},annotations:readAnnotations},({workId,chapterNumber})=>result(()=>store.getChapter(workId,chapterNumber)));
server.registerTool('save_draft',{title:'保存章节草稿',description:'按刚读取的要求和正文基线保存草稿。没有旧正文时 expectedChapterRevision=0；状态始终为 draft，不能代替人工采用。冲突时先重读，不重试旧基线。',inputSchema:draftInput.shape,annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}},input=>result(()=>store.saveDraft(input,'agent',taskId)));
const transport=new StdioServerTransport();
transport.onclose=()=>store.close();
await server.connect(transport);
process.stdin.once('end',()=>server.close());
