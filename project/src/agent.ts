import {Codex,type ThreadEvent,type Usage} from '@openai/codex-sdk';
import {randomUUID} from 'node:crypto';
import {appendFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Store} from './store.js';
import {workId,chapterNumber} from './schemas.js';

const {values}=parseArgs({options:{db:{type:'string',default:'data/novel.sqlite'},work:{type:'string',default:'clocktower'},chapter:{type:'string',default:'1'},'cancel-after-ms':{type:'string'}}});
const root=process.cwd(),db=resolve(values.db!);
const store=new Store(db);
const id=workId.parse(values.work),number=chapterNumber.parse(Number(values.chapter));
const taskId=randomUUID(),runDir=resolve('runs',taskId);
await mkdir(runDir,{recursive:true});
let config:{model?:string;codexPathOverride?:string}={};
try{config=JSON.parse(await readFile('lab.config.json','utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
const codeVersion=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
store.createTask({id:taskId,workId:id,chapterNumber:number,codeVersion});
const baseline=store.getChapter(id,number);
const prompt=`请完成作品 ${id} 的第 ${number} 章草稿任务。先使用 novel_lab 的 read_work 和 read_chapter 读取当前用途、设定、大纲、要求及正文修订。依据当前材料生成约 800 至 1200 个中文字符的完整章节，使用 save_draft 真实保存，再用 read_chapter 和 list_chapters 核对。只调用 novel_lab 业务工具，不使用 shell、直接写文件或其他插件。遇到缺少重要决定或修订冲突时准确说明，不猜测、不用旧基线覆盖。不要自行采用稿件。最后只汇报作品、章节、实际保存修订、保存状态及待人工判断事项；完成宣言不能替代读回结果。`;
await writeFile(resolve(runDir,'input.json'),JSON.stringify({taskId,workId:id,chapterNumber:number,db,codeVersion,baselineRevision:baseline?.revision??0,configuredModel:config.model??null,runtime:'项目锁定 Codex SDK 及其 CLI',prompt},null,2));
const codex=new Codex({codexPathOverride:config.codexPathOverride,config:{mcp_servers:{novel_lab:{command:process.execPath,args:[resolve('dist/mcp.js'),db,taskId],cwd:root,required:true,enabled:true,default_tools_approval_mode:'approve'}}}});
const thread=codex.startThread({workingDirectory:root,sandboxMode:'read-only',approvalPolicy:'never',webSearchMode:'disabled',model:config.model});
const controller=new AbortController();
const cancel=()=>controller.abort();
process.once('SIGINT',cancel);
let timer:ReturnType<typeof setTimeout>|undefined;
if(values['cancel-after-ms']){
  const delay=Number(values['cancel-after-ms']);
  if(!Number.isFinite(delay)||delay<=0)throw new Error('取消延迟必须为正数。');
  timer=setTimeout(cancel,delay);
}
let completed=false,error:string|null=null,usage:Usage|null=null,finalResponse='';
const toolCalls:unknown[]=[];
store.updateTask(taskId,{state:'running'});
console.log(JSON.stringify({taskId,state:'running',runDir}));
try{
  const {events}=await thread.runStreamed(prompt,{signal:controller.signal});
  for await(const event of events){
    await appendFile(resolve(runDir,'events.jsonl'),JSON.stringify(event)+'\n');
    if(event.type==='thread.started')store.updateTask(taskId,{threadId:event.thread_id});
    if(event.type==='turn.completed'){completed=true;usage=event.usage;}
    if(event.type==='turn.failed')error=event.error.message;
    if(event.type==='error')error=event.message;
    if(event.type==='item.completed'&&event.item.type==='agent_message')finalResponse=event.item.text;
    if(event.type==='item.completed'&&event.item.type==='mcp_tool_call')toolCalls.push(event.item);
    // 终端只显示运行变化，完整公开事件保存在本轮记录中。
    const progress:Record<string,unknown>={event:event.type};
    if('item' in event){progress.itemType=event.item.type;if(event.item.type==='mcp_tool_call'){progress.tool=event.item.tool;progress.status=event.item.status;}}
    console.log(JSON.stringify(progress));
  }
}catch(cause){error=cause instanceof Error?cause.message:String(cause);}
finally{
  if(timer)clearTimeout(timer);
  process.removeListener('SIGINT',cancel);
}
const state=controller.signal.aborted?'cancelled':error?'failed':completed?'completed':'interrupted';
const task=store.updateTask(taskId,{state,error,usage});
const chapter=store.getChapter(id,number);
const savedDuringTask=chapter?.taskId===taskId;
await writeFile(resolve(runDir,'final-response.txt'),finalResponse,'utf8');
await writeFile(resolve(runDir,'chapter.json'),JSON.stringify(chapter,null,2));
const report={task,baselineRevision:baseline?.revision??0,savedDuringTask,chapter:chapter?{number:chapter.number,revision:chapter.revision,status:chapter.status,workRevision:chapter.workRevision,taskId:chapter.taskId,threadId:chapter.threadId,characters:chapter.body.length}:null,toolCalls,finalResponse,limits:'运行状态与保存结果分别记录；文学品质和设定语义仍需人读正文判断。'};
await writeFile(resolve(runDir,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({taskId,threadId:task.threadId,state,savedDuringTask,revision:chapter?.revision??null,status:chapter?.status??null,runDir,error}));
store.close();
if(state!=='completed'||!savedDuringTask)process.exitCode=1;
