import {Codex} from '@openai/codex-sdk';
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {parseArgs,isDeepStrictEqual} from 'node:util';
import {Store} from '../dist/store.js';
import {chapterNumber} from '../dist/schemas.js';
import {getCodeVersion} from '../dist/version.js';
import {currentPractice,snapshotDatabase} from './practice-state.mjs';
import {prepareHost} from './prepare-host.mjs';
import {pluginRuntime} from './plugin-runtime.mjs';

const {values}=parseArgs({options:{prompt:{type:'string'},chapter:{type:'string'},'read-only':{type:'boolean',default:false},excerpt:{type:'string'},'resume-run':{type:'string'},'stop-after-save':{type:'boolean',default:false}}});
if(!values.prompt||!values.chapter)throw new Error('需要完整提示文件和本次章号。');
if(values['stop-after-save']&&(values['read-only']||values['resume-run']))throw new Error('保存后教学停止只用于新建写作任务。');
const practice=currentPractice(),number=chapterNumber.parse(Number(values.chapter)),database=resolve(practice.database),runId=randomUUID(),out=resolve('runs',runId);
const prior=values['resume-run']?JSON.parse(readFileSync(resolve(values['resume-run'],'report.json'),'utf8')):null;
if(prior&&(!prior.threadId||prior.database!==database||prior.workId!==practice.workId))throw new Error('接续必须使用本练习库中已记录的会话；先核对当前库与原运行。');
const prompt=readFileSync(values.prompt,'utf8'),sourceVersion=getCodeVersion(),before=snapshotDatabase(database),store=new Store(database);
mkdirSync(out,{recursive:true});
const save=(name,value)=>writeFileSync(resolve(out,name),JSON.stringify(value,null,2)+'\n');
save('before.json',before);
save('input.json',{runId,sourceVersion,database,workId:practice.workId,chapterNumber:number,promptFile:values.prompt,prompt,readOnly:values['read-only'],resumeThreadId:prior?.threadId??null,stopAfterSave:values['stop-after-save']});
let task=store.createTask({id:runId,workId:practice.workId,chapterNumber:number,codeVersion:sourceVersion});
let threadId=prior?.threadId??null,completed=false,error=null,usage=null,stopProof=null,eventCount=0;
const controller=new AbortController(),timeout=AbortSignal.timeout(600000),signal=AbortSignal.any([controller.signal,timeout]);
const stop=()=>controller.abort();process.once('SIGINT',stop);
try{
  const prepared=await prepareHost({taskId:runId,excerpt:values.excerpt??null,readOnly:values['read-only']});
  const {runtime,threadOptions}=await pluginRuntime(process.cwd(),{readOnly:values['read-only']});
  if(!isDeepStrictEqual(runtime,prepared.report.runtime))throw new Error('当前宿主配置与刚完成的无模型检查不一致。');
  save('input.json',{runId,sourceVersion,database,workId:practice.workId,chapterNumber:number,promptFile:values.prompt,prompt,readOnly:values['read-only'],resumeThreadId:threadId,stopAfterSave:values['stop-after-save'],binding:prepared.binding,runtime,threadOptions,hostCheck:prepared.out});
  task=store.updateTask(runId,{state:'running',...(threadId?{threadId}:{})});
  console.log(JSON.stringify({runId,out,state:'running',threadId}));
  const codex=new Codex(runtime),thread=threadId?codex.resumeThread(threadId,threadOptions):codex.startThread(threadOptions);
  const {events}=await thread.runStreamed(prompt,{signal});
  for await(const event of events){
    eventCount++;appendFileSync(resolve(out,'events.jsonl'),JSON.stringify(event)+'\n');
    if(event.type==='thread.started'){threadId=event.thread_id;store.updateTask(runId,{threadId});}
    if(event.type==='turn.completed'){completed=true;usage=event.usage;}
    if(event.type==='turn.failed')error=event.error.message;
    if(event.type==='error')error=event.message;
    if(event.type==='item.completed'&&event.item.type==='agent_message')appendFileSync(resolve(out,'all-agent-messages.txt'),event.item.text+'\n\n');
    const receipt=event.type==='item.completed'&&event.item.type==='mcp_tool_call'&&event.item.tool==='save_draft'&&event.item.status==='completed'?event.item.result?.structured_content?.result:null;
    if(values['stop-after-save']&&!stopProof&&receipt?.workId===practice.workId&&receipt.number===number&&receipt.status==='draft'){
      const actual=store.getChapter(practice.workId,number);
      if(!isDeepStrictEqual(actual,receipt))throw new Error('保存返回与实际当前正文不同，不能标记为已确认保存后停止。');
      // 只在成功保存已独立读回后触发一次教学中断，不撤销已提交的业务事务。
      stopProof={eventCount,toolItemId:event.item.id,turnCompletedAtTrigger:completed,receipt,actual,reason:'教师设置的保存后停止点'};controller.abort();
    }
    console.log(JSON.stringify({event:event.type,...('item' in event?{itemType:event.item.type,...(event.item.type==='mcp_tool_call'?{tool:event.item.tool,status:event.item.status}:{})}:{})}));
  }
}catch(cause){error=cause instanceof Error?cause.message:String(cause);}
finally{process.removeListener('SIGINT',stop);}
const state=controller.signal.aborted?'cancelled':error?'failed':completed?'completed':'interrupted';
task=store.updateTask(runId,{state,error,usage});store.close();
const after=snapshotDatabase(database);save('after.json',after);save('stop-proof.json',stopProof);
const report={runId,sourceVersion,database,workId:practice.workId,chapterNumber:number,threadId,state,completed,error,usage,timeoutReached:timeout.aborted,eventCount,task,stopProof,readOnly:values['read-only'],businessUnchanged:['works','work_versions','chapters','chapter_versions'].every(table=>isDeepStrictEqual(before[table],after[table])),scope:'Harness运行、业务保存与人工采用分别核对。只读任务仍记录本轮Task；不会把历史恢复当作新模型运行。'};
save('report.json',report);console.log(JSON.stringify({out,runId,threadId,state,error,completed,modelRunRequested:true}));
if(state!=='completed')process.exitCode=1;
