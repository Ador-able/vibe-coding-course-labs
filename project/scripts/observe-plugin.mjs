import {Codex} from '@openai/codex-sdk';
import {appendFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {pluginRuntime} from './plugin-runtime.mjs';
import {archivePluginSession} from './archive-plugin-session.mjs';
import {Store} from '../dist/store.js';
import {workId,chapterNumber} from '../dist/schemas.js';

const {values}=parseArgs({options:{db:{type:'string',default:'data/plugin.sqlite'},work:{type:'string',default:'clocktower'},chapter:{type:'string',default:'1'},prompt:{type:'string'}}});
if(!values.prompt)throw new Error('需要保存了完整请求的提示文件。');
const root=process.cwd(),database=resolve(values.db),out=resolve('runs',randomUUID());
const preflight=JSON.parse(await readFile('runs/plugin-preflight.json','utf8'));
if(!preflight.isolated||!preflight.skillsIsolated||!preflight.memoryIsolated||preflight.skills.length!==2)throw new Error('插件 Skill、配置的工具与记忆配置尚未通过本机隔离检查。');
const {runtime,threadOptions}=await pluginRuntime(root);
const binding=JSON.parse(await readFile('plugins/novel-workbench-course/binding.json','utf8'));
if(resolve(binding.database)!==database)throw new Error('观察数据库与插件实际绑定不一致；请重新准备本次绑定。');
const prompt=await readFile(values.prompt,'utf8');
const id=workId.parse(values.work),number=chapterNumber.parse(Number(values.chapter));
let taskBefore=null;
if(binding.taskId){
  const store=new Store(database);
  try{taskBefore=store.getTask(binding.taskId);if(taskBefore.workId!==id||taskBefore.chapterNumber!==number)throw new Error('观察目标与插件任务对象不一致。');}finally{store.close();}
}
const snapshot=()=>{const db=new DatabaseSync(database,{readOnly:true});try{return Object.fromEntries(['works','work_versions','chapters','chapter_versions','tasks'].map(table=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()]));}finally{db.close();}};
const before=snapshot();
await mkdir(out,{recursive:true});
await writeFile(resolve(out,'input.json'),JSON.stringify({root,database,workId:id,chapterNumber:number,taskBefore,binding,runtime,threadOptions,codeVersion:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),prompt},null,2));
await writeFile(resolve(out,'before.json'),JSON.stringify(before,null,2));
console.log(JSON.stringify({out,state:'running'}));
let threadId=null,completed=false,error=null,finalResponse='',usage=null,cancelled=false;
const controller=new AbortController();
// 请求停止后仍记录已取得事件和业务状态；取消不撤回已保存稿件。
const stop=()=>{cancelled=true;controller.abort();};
process.once('SIGINT',stop);
const taskStore=binding.taskId?new Store(database):null;
try{
  taskStore?.updateTask(binding.taskId,{state:'running'});
  const thread=new Codex(runtime).startThread(threadOptions);
  const {events}=await thread.runStreamed(prompt,{signal:controller.signal});
  for await(const event of events){
    await appendFile(resolve(out,'events.jsonl'),JSON.stringify(event)+'\n');
    if(event.type==='thread.started'){threadId=event.thread_id;taskStore?.updateTask(binding.taskId,{threadId});}
    if(event.type==='turn.completed'){completed=true;usage=event.usage;}
    if(event.type==='turn.failed')error=event.error.message;
    if(event.type==='error')error=event.message;
    if(event.type==='item.completed'&&event.item.type==='agent_message')finalResponse=event.item.text;
    console.log(JSON.stringify({event:event.type,...('item' in event?{itemType:event.item.type,...(event.item.type==='mcp_tool_call'?{tool:event.item.tool,status:event.item.status}:{})}:{})}));
  }
}catch(cause){error=cause instanceof Error?cause.message:String(cause);}
finally{process.removeListener('SIGINT',stop);}
const state=cancelled?'cancelled':error?'failed':completed?'completed':'interrupted';
let task=null;
try{if(taskStore)task=taskStore.updateTask(binding.taskId,{state,error,usage});}finally{taskStore?.close();}
const after=snapshot();
await writeFile(resolve(out,'after.json'),JSON.stringify(after,null,2));
await writeFile(resolve(out,'final-response.txt'),finalResponse);
let archived=false,archiveError=null;
if(threadId){const result=await archivePluginSession(root,threadId,out);archived=result.archived;archiveError=result.error;}
const report={out,threadId,completed,cancelled,error,usage,task,archived,archiveError,countsBefore:Object.fromEntries(Object.entries(before).map(([key,rows])=>[key,rows.length])),countsAfter:Object.fromEntries(Object.entries(after).map(([key,rows])=>[key,rows.length])),limits:'保存对象与正文需逐项对照原始工具事件；已绑定任务仅记录本轮目标及实际运行，不证明长期调度或文学采用。取消不撤回已执行的保存。文学表现仍需人工阅读。'};
await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
if(!completed||error||cancelled)process.exitCode=1;
