import { Codex } from '@openai/codex-sdk';
import { randomUUID, createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {checkedTaskRuntime} from './task-runtime.mjs';
import {getCodeVersion} from './version.mjs';

const {values}=parseArgs({options:{condition:{type:'string'}}});
if(!['A','B'].includes(values.condition))throw new Error('请选择既定条件 A 或 B。');
const condition=values.condition,root=process.cwd(),runId=randomUUID(),dir=resolve('runs',`${condition}-${runId}`);
// 开始调用前核对已经冻结的完整输入，变化后需重新确认任务。
const inputsManifest=JSON.parse(await readFile('inputs-manifest.json','utf8'));
for(const file of inputsManifest.files){const bytes=await readFile(file.path);if(bytes.length!==file.bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error(`输入已变化：${file.path}。请先核对完整材料与清单。`);}
await mkdir(dir,{recursive:true});
const prompt=await readFile(resolve('prompts',`会话${condition}完整输入.txt`),'utf8');
const materialFiles=(await readdir(resolve('materials'))).sort();
async function snapshot(){const rows=[];for(const file of materialFiles){const bytes=await readFile(resolve('materials',file));rows.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}return rows;}
const before=await snapshot(),codeVersion=getCodeVersion();
const {runtime,options}=checkedTaskRuntime();
// 记录器只消费成熟宿主的事件，不实现工具循环、委派或失败重试。
const codex=new Codex(runtime),thread=codex.startThread(options);
const startedAt=new Date().toISOString(),startMs=performance.now();
await writeFile(resolve(dir,'input.json'),JSON.stringify({condition,runId,codeVersion,startedAt,runtime,options,prompt,promptSha256:createHash('sha256').update(prompt).digest('hex'),inputsManifest,materialBefore:before,naturalEnd:'一次 startThread/runStreamed，最多十分钟；正常任务自然结束，无自动重试或额外调度。'},null,2));
console.log(JSON.stringify({condition,runId,dir,codeVersion,startedAt}));
let threadId=null,usage=null,error=null,completed=false;const messages=[];
try {
 const {events}=await thread.runStreamed(prompt,{signal:AbortSignal.timeout(600000)});
 for await(const event of events){
  const at=new Date().toISOString(),elapsedMs=performance.now()-startMs;
  await appendFile(resolve(dir,'events.jsonl'),JSON.stringify(event)+'\n');
  await appendFile(resolve(dir,'timed-events.jsonl'),JSON.stringify({at,elapsedMs,event})+'\n');
  if(event.type==='thread.started')threadId=event.thread_id;
  if(event.type==='turn.completed'){completed=true;usage=event.usage;}
  if(event.type==='turn.failed')error=event.error?.message??JSON.stringify(event.error);
  if(event.type==='error')error=event.message;
  if(event.type==='item.completed'&&event.item.type==='agent_message')messages.push(event.item.text);
  console.log(JSON.stringify({at,elapsedMs,type:event.type,itemType:event.item?.type,tool:event.item?.tool,status:event.item?.status}));
 }
}catch(cause){error=cause instanceof Error?cause.message:String(cause);}
const endedAt=new Date().toISOString(),elapsedMs=performance.now()-startMs,after=await snapshot();
await writeFile(resolve(dir,'all-agent-messages.txt'),messages.join('\n\n'));
const report={condition,runId,codeVersion,threadId,startedAt,endedAt,elapsedMs,state:error?'failed':completed?'completed':'interrupted',turnCompleted:completed,usage,error,materialBefore:before,materialAfter:after,materialByteIdentical:JSON.stringify(before)===JSON.stringify(after),scope:'主会话全部公开 SDK 事件；子会话原始工具和任务需要据真实 receiver_thread_ids 另行读取，不能把本报告的 usage 当整个团队用量。'};
await writeFile(resolve(dir,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({condition,runId,threadId,state:report.state,dir,elapsedMs,materialByteIdentical:report.materialByteIdentical}));
if(report.state!=='completed')process.exitCode=1;
