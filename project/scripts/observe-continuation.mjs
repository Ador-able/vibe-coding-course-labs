import {Codex} from '@openai/codex-sdk';
import {appendFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import {DatabaseSync,backup} from 'node:sqlite';
import {pluginRuntime} from './plugin-runtime.mjs';
import {archivePluginSession} from './archive-plugin-session.mjs';
import {Store} from '../dist/store.js';
import {workId,chapterNumber} from '../dist/schemas.js';

const {values}=parseArgs({options:{db:{type:'string'},work:{type:'string'},chapter:{type:'string'},prompt:{type:'string'},resume:{type:'string'},out:{type:'string'},'stop-after-save':{type:'boolean',default:false},'archive-final':{type:'boolean',default:false}}});
if(!values.db||!values.work||!values.chapter||!values.prompt)throw new Error('需要本节数据库、作品、章号和完整教师输入。');
if(values.resume&&values['stop-after-save'])throw new Error('本节只在首轮保存成功后设置教学停止点。');
if(values['archive-final']&&!values.resume)throw new Error('本节只在最后的接续回合显式归档会话。');
const root=process.cwd(),database=resolve(values.db),out=values.out?resolve(values.out):resolve('runs',randomUUID());
const preflight=JSON.parse(await readFile('runs/plugin-preflight.json','utf8'));
const {settings,runtime,threadOptions}=await pluginRuntime(root);
const skillEntry=preflight.catalog.data.find(item=>item.cwd===root);
const skills=(skillEntry?.skills??[]).filter(item=>item.enabled);
const names=['novel-workbench-course:novel-chapter-review','novel-workbench-course:novel-chapter-task'];
if(!preflight.isolated||!preflight.skillsIsolated||!preflight.memoryIsolated||!skillEntry||skillEntry.errors.length||skills.length!==2||!skills.every(item=>item.pluginId===settings.pluginId)||JSON.stringify(skills.map(item=>item.name).sort())!==JSON.stringify(names))throw new Error('本次方法和业务目录尚未通过实际检查。');
const binding=JSON.parse(await readFile('plugins/novel-workbench-course/binding.json','utf8'));
if(resolve(binding.database)!==database)throw new Error('实际绑定数据库与本次观察对象不一致。');
const id=workId.parse(values.work),number=chapterNumber.parse(Number(values.chapter));
// 每轮使用自己的已创建 Task；接续会话不覆盖旧任务状态。
if(!binding.taskId)throw new Error('本轮必须绑定已经创建的准确 Task。');
const taskStore=new Store(database);
let taskBefore=null;
try{
  taskBefore=taskStore.getTask(binding.taskId);
  if(taskBefore.workId!==id||taskBefore.chapterNumber!==number)throw new Error('任务绑定与本次目标不一致。');
  if(taskBefore.state!=='created')throw new Error('本轮只运行新创建的Task，不覆盖已经运行的任务。');
}catch(error){taskStore.close();throw error;}
const snapshot=()=>{const db=new DatabaseSync(database,{readOnly:true});try{return JSON.parse(JSON.stringify(Object.fromEntries(['works','work_versions','chapters','chapter_versions','tasks'].map(table=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()]))));}finally{db.close();}};
const saveBackup=async name=>{const db=new DatabaseSync(database,{readOnly:true});try{await backup(db,resolve(out,name));}finally{db.close();}};
const prompt=await readFile(values.prompt,'utf8'),before=snapshot();
// 每轮显式目录只创建一次，保留之前失败或停止的原始记录。
await mkdir(resolve(out,'..'),{recursive:true});await mkdir(out);
await writeFile(resolve(out,'input.json'),JSON.stringify({root,database,workId:id,chapterNumber:number,taskBefore,binding,runtime,threadOptions,codeVersion:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),resumeThreadId:values.resume??null,stopAfterSave:values['stop-after-save'],archiveFinal:values['archive-final'],prompt},null,2)+'\n');
await writeFile(resolve(out,'before.json'),JSON.stringify(before,null,2)+'\n');await saveBackup('before.sqlite');
console.log(JSON.stringify({out,state:'running',resumeThreadId:values.resume??null}));
const controller=new AbortController();let threadId=values.resume??null,completed=false,cancelled=false,error=null,usage=null,finalResponse='',eventCount=0,stopProof=null;
const manualStop=()=>{cancelled=true;controller.abort();};process.once('SIGINT',manualStop);
const startedAt=Date.now();
// 只报告进度；没有按耗时取消、补发或自动续轮的行为。
const progress=setInterval(()=>console.log(JSON.stringify({state:'still_running',elapsedMs:Date.now()-startedAt,eventCount,threadId})),300000);
try{
  taskStore.updateTask(binding.taskId,{state:'running',...(values.resume?{threadId:values.resume}:{})});
  const codex=new Codex(runtime),thread=values.resume?codex.resumeThread(values.resume,threadOptions):codex.startThread(threadOptions);
  const {events}=await thread.runStreamed(prompt,{signal:controller.signal});
  for await(const event of events){
    eventCount++;await appendFile(resolve(out,'events.jsonl'),JSON.stringify(event)+'\n');
    if(event.type==='thread.started'){threadId=event.thread_id;taskStore?.updateTask(binding.taskId,{threadId});}
    if(event.type==='turn.completed'){completed=true;usage=event.usage;}
    if(event.type==='turn.failed')error=event.error.message;
    if(event.type==='error')error=event.message;
    if(event.type==='item.completed'&&event.item.type==='agent_message')finalResponse=event.item.text;
    const receipt=event.type==='item.completed'&&event.item.type==='mcp_tool_call'&&event.item.tool==='save_draft'&&event.item.status==='completed'?event.item.result?.structured_content?.result:null;
    if(values['stop-after-save']&&!stopProof&&!completed&&receipt?.workId===id&&receipt.number===number&&receipt.status==='draft'){
      // 教学停止点依据实际成功返回；中断不撤销业务事务。
      stopProof={at:new Date().toISOString(),eventIndex:eventCount-1,eventCountAtTrigger:eventCount,receivedTurnCompleted:completed,toolItemId:event.item.id,receipt,actor:'编者设置的一次教学停止点',operation:'AbortController.abort()'};
      cancelled=true;controller.abort();
    }
    console.log(JSON.stringify({event:event.type,...('item' in event?{itemType:event.item.type,...(event.item.type==='mcp_tool_call'?{tool:event.item.tool,status:event.item.status}:{})}:{})}));
  }
}catch(cause){error={name:cause.name,message:cause.message,stack:cause.stack};}
finally{clearInterval(progress);process.removeListener('SIGINT',manualStop);}
const state=cancelled?'cancelled':error?'failed':completed?'completed':'interrupted';
let task=null;try{task=taskStore.updateTask(binding.taskId,{state,error:typeof error==='string'?error:error?.message??null,usage});}finally{taskStore.close();}
const after=snapshot();await writeFile(resolve(out,'after.json'),JSON.stringify(after,null,2)+'\n');await saveBackup('after.sqlite');
await writeFile(resolve(out,'stop-proof.json'),JSON.stringify(stopProof,null,2)+'\n');await writeFile(resolve(out,'final-response.txt'),finalResponse);
let archived=false,archiveError=null;
// A和B保留同一会话；C显式归档，不取得私有rollout。
if(values['archive-final']&&threadId){const result=await archivePluginSession(root,threadId,out);archived=result.archived;archiveError=result.error;}
const report={out,threadId,resumeThreadId:values.resume??null,completed,cancelled,error,usage,task,stopProof,eventCount,archiveFinal:values['archive-final'],archived,archiveError,state,limits:['SDK事件不提供逐模型请求计数。','A已保存返回后的教学停止与真正未确认写入分开；真实对象仍须另读。','Task运行状态不替代稿件状态、当前修订或人的采用。','A和B不归档；只有指定archive-final的C归档这个自有会话。','五分钟只报告进度，不按耗时自动取消或续发。','不读取私有rollout，不修改共享配置或其他前置作品。']};
await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
if(error||cancelled||!completed)process.exitCode=1;
