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

const {values}=parseArgs({options:{db:{type:'string'},work:{type:'string'},chapter:{type:'string'},prompt:{type:'string'},resume:{type:'string'},'stop-after-save':{type:'boolean',default:false}}});
if(!values.db||!values.work||!values.chapter||!values.prompt)throw new Error('需要本节数据库、作品、章号和完整教师输入。');
if(values.resume&&values['stop-after-save'])throw new Error('接续阶段只读，不设置保存后的停止点。');
const root=process.cwd(),database=resolve(values.db),out=resolve('runs',randomUUID());
const preflight=JSON.parse(await readFile('runs/plugin-preflight.json','utf8'));
const {settings,runtime,threadOptions}=await pluginRuntime(root);
const skillEntry=preflight.catalog.data.find(item=>item.cwd===root);
const skills=(skillEntry?.skills??[]).filter(item=>item.enabled);
const names=['novel-workbench-course:novel-chapter-review','novel-workbench-course:novel-chapter-task'];
if(!preflight.isolated||!preflight.skillsIsolated||!preflight.memoryIsolated||!skillEntry||skillEntry.errors.length||skills.length!==2||!skills.every(item=>item.pluginId===settings.pluginId)||JSON.stringify(skills.map(item=>item.name).sort())!==JSON.stringify(names))throw new Error('本次方法和业务目录尚未通过实际检查。');
const binding=JSON.parse(await readFile('plugins/novel-workbench-course/binding.json','utf8'));
if(resolve(binding.database)!==database)throw new Error('实际绑定数据库与本次观察对象不一致。');
const id=workId.parse(values.work),number=chapterNumber.parse(Number(values.chapter));
const taskStore=binding.taskId?new Store(database):null;
let taskBefore=null;
if(taskStore){taskBefore=taskStore.getTask(binding.taskId);if(taskBefore.workId!==id||taskBefore.chapterNumber!==number)throw new Error('任务绑定与本次目标不一致。');}
if(values.resume&&binding.taskId)throw new Error('只读接续不改写原运行Task。');
const snapshot=()=>{const db=new DatabaseSync(database,{readOnly:true});try{return JSON.parse(JSON.stringify(Object.fromEntries(['works','work_versions','chapters','chapter_versions','tasks'].map(table=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()]))));}finally{db.close();}};
const saveBackup=async name=>{const db=new DatabaseSync(database,{readOnly:true});try{await backup(db,resolve(out,name));}finally{db.close();}};
const prompt=await readFile(values.prompt,'utf8'),before=snapshot();
await mkdir(out,{recursive:true});
await writeFile(resolve(out,'input.json'),JSON.stringify({root,database,workId:id,chapterNumber:number,taskBefore,binding,runtime,threadOptions,codeVersion:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),resumeThreadId:values.resume??null,stopAfterSave:values['stop-after-save'],prompt},null,2)+'\n');
await writeFile(resolve(out,'before.json'),JSON.stringify(before,null,2)+'\n');await saveBackup('before.sqlite');
console.log(JSON.stringify({out,state:'running',resumeThreadId:values.resume??null}));
const controller=new AbortController();let threadId=values.resume??null,completed=false,cancelled=false,error=null,usage=null,finalResponse='',eventCount=0,stopProof=null;
const manualStop=()=>{cancelled=true;controller.abort();};process.once('SIGINT',manualStop);
try{
  taskStore?.updateTask(binding.taskId,{state:'running'});
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
finally{process.removeListener('SIGINT',manualStop);}
const state=cancelled?'cancelled':error?'failed':completed?'completed':'interrupted';
let task=null;try{if(taskStore)task=taskStore.updateTask(binding.taskId,{state,error:error?.message??null,usage});}finally{taskStore?.close();}
const after=snapshot();await writeFile(resolve(out,'after.json'),JSON.stringify(after,null,2)+'\n');await saveBackup('after.sqlite');
await writeFile(resolve(out,'stop-proof.json'),JSON.stringify(stopProof,null,2)+'\n');await writeFile(resolve(out,'final-response.txt'),finalResponse);
let archived=false,archiveError=null;
// A保持自有会话可接续；B结束后归档，不取得私有rollout。
if(values.resume&&threadId){const result=await archivePluginSession(root,threadId,out);archived=result.archived;archiveError=result.error;}
const report={out,threadId,resumeThreadId:values.resume??null,completed,cancelled,error,usage,task,stopProof,eventCount,archived,archiveError,state,limits:['SDK事件不提供逐模型请求计数。','A已保存返回后的教学停止与真正未确认写入分开；真实对象仍须另读。','Task运行状态不替代稿件状态、当前修订或人的采用。','A暂不归档以等待同一thread的B；B归档只作用于这个自有会话。','不读取私有rollout，不修改共享配置或其他前置作品。']};
await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
if(error||cancelled||!completed)process.exitCode=1;
