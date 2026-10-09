import {Codex,type ThreadEvent,type Usage} from '@openai/codex-sdk';
import {randomUUID} from 'node:crypto';
import {appendFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Store} from './store.js';
import {workId,chapterNumber} from './schemas.js';

const {values}=parseArgs({options:{db:{type:'string',default:'data/novel.sqlite'},work:{type:'string',default:'clocktower'},chapter:{type:'string',default:'1'},'resume-task':{type:'string'},'cancel-after-ms':{type:'string'}}});
const root=process.cwd(),db=resolve(values.db!);
const store=new Store(db);
const id=workId.parse(values.work),number=chapterNumber.parse(Number(values.chapter));
const previousTask=values['resume-task']?store.getTask(values['resume-task']):null;
if(previousTask&&!previousTask.threadId)throw new Error('原任务尚未取得 Harness 会话标识，不能接续。');
if(previousTask&&previousTask.workId!==id)throw new Error('本实验接续同一作品的任务；另一作品请开始新会话。');
const taskId=randomUUID(),runDir=resolve('runs',taskId);
await mkdir(runDir,{recursive:true});
let config:{model?:string;codexPathOverride?:string}={};
try{config=JSON.parse(await readFile('lab.config.json','utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
const codeVersion=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
store.createTask({id:taskId,workId:id,chapterNumber:number,codeVersion});
const baseline=store.getChapter(id,number);
const prompt=`请完成作品 ${id} 的第 ${number} 章草稿任务。先使用 novel_lab 的 read_work、list_chapters 和 read_chapter 读取当前用途、设定、大纲、要求、目标章及前面每章的正文和修订。${previousTask?'这是使用旧 Harness 会话接续的新任务；业务资料可能已由人工入口修改。记忆或旧回复不能代替当前读取。':''}依据当前材料生成约 800 至 1200 个中文字符的完整章节，使用 save_draft 真实保存，再用 read_chapter 和 list_chapters 核对。expectedPreviousRevisions 应逐项记录前面各章的当前修订，第一章为 []。只调用 novel_lab 业务工具，不使用 shell、直接写文件或其他插件。发现关键条件冲突或旧资料与现在不同，依据当前资料；重要取舍无法据现有材料决定时准确说明，不猜测、不用旧基线覆盖。不要自行采用稿件。最后只汇报作品、章节、实际保存修订、保存状态及待人工判断事项；完成宣言不能替代读回结果。`;
await writeFile(resolve(runDir,'input.json'),JSON.stringify({taskId,workId:id,chapterNumber:number,db,codeVersion,baselineRevision:baseline?.revision??0,previousTaskId:previousTask?.id??null,requestedThreadId:previousTask?.threadId??null,configuredModel:config.model??null,runtime:'项目锁定 Codex SDK 及其 CLI',prompt},null,2));
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
  const codex=new Codex({codexPathOverride:config.codexPathOverride,config:{plugins:{'novel-workbench-course@novel-workbench-course-lab':{enabled:false}},mcp_servers:{novel_lab:{command:process.execPath,args:[resolve('dist/mcp.js'),db,taskId],cwd:root,required:true,enabled:true,default_tools_approval_mode:'approve'}}}});
  const options={workingDirectory:root,sandboxMode:'read-only' as const,approvalPolicy:'never' as const,webSearchMode:'disabled' as const,model:config.model};
  const thread=previousTask?.threadId?codex.resumeThread(previousTask.threadId,options):codex.startThread(options);
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
