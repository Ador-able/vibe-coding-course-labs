import {checkedTaskRuntime} from './task-runtime.mjs';
import {getCodeVersion} from '../dist/version.js';
import {Codex} from '@openai/codex-sdk';
import {randomUUID,createHash} from 'node:crypto';
import {appendFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {Store} from '../dist/store.js';

const {values}=parseArgs({options:{mode:{type:'string'},folder:{type:'string',default:'task-state'}}});
if(!['A','B'].includes(values.mode))throw new Error('只支持实际会话 A 或 B。');
const mode=values.mode,root=process.cwd(),task=JSON.parse(await readFile(resolve(values.folder,'task.json'),'utf8')),
  prompt=await readFile(resolve(values.folder,`会话${mode}完整输入.txt`),'utf8'),runId=randomUUID(),runDir=resolve('runs',`cross-session-${mode}-${runId}`);
await mkdir(runDir,{recursive:true});
const codeVersion=getCodeVersion();
const {runtime,options}=checkedTaskRuntime();
// 两轮都调用官方 startThread；第二轮没有恢复第一轮聊天。
const codex=new Codex(runtime),thread=codex.startThread(options),controller=new AbortController();
await writeFile(resolve(runDir,'input.json'),JSON.stringify({runId,mode,task,codeVersion,runtime,options,prompt,conversation:'官方 startThread 新会话；未提供旧会话或旧聊天',cancellation:mode==='A'?'收到实际 CLI export 完成事件、退出码 0 且完整导出核对一致后发送 AbortSignal':'无预设取消'},null,2));
let completed=false,error=null,usage=null,threadId=null,abortEvidence=null;
const messages=[];
console.log(JSON.stringify({runId,mode,codeVersion,runDir,state:'running'}));
try{
  const {events}=await thread.runStreamed(prompt,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(600000)])});
  for await(const event of events){
    await appendFile(resolve(runDir,'events.jsonl'),JSON.stringify(event)+'\n');
    if(event.type==='thread.started')threadId=event.thread_id;
    if(event.type==='turn.completed'){completed=true;usage=event.usage;}
    if(event.type==='turn.failed')error=event.error.message;
    if(event.type==='error')error=event.message;
    if(event.type==='item.completed'&&event.item.type==='agent_message')messages.push(event.item.text);
    console.log(JSON.stringify({event:event.type,itemType:event.item?.type,status:event.item?.status}));
    const item=event.item;
    if(mode==='A'&&!controller.signal.aborted&&event.type==='item.completed'&&item?.type==='command_execution'&&item.status==='completed'&&item.exit_code===0&&item.command.includes('dist/cli.js')&&item.command.includes('export')&&item.command.includes(task.deliverable)){
      const bytes=await readFile(resolve(task.deliverable)),store=new Store(resolve(task.db));
      let expected;try{expected=Buffer.from(store.exportWork(task.id).text,'utf8');}finally{store.close();}
      if(bytes.equals(expected)){
        abortEvidence={at:new Date().toISOString(),event,threadId,deliverable:task.deliverable,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),wholeExportByteEqual:true,scope:'文件已完整保存；这时发送取消。取消是否赶在下一步前生效按后续公开事件与实际文件记录。'};
        await writeFile(resolve(runDir,'cancel-trigger.json'),JSON.stringify(abortEvidence,null,2));
        controller.abort();
      }
    }
  }
}catch(cause){error=cause instanceof Error?cause.message:String(cause);}
const state=controller.signal.aborted?'cancelled':error?'failed':completed?'completed':'interrupted',finalResponse=messages.join('\n\n');
await writeFile(resolve(runDir,'final-response.txt'),finalResponse,'utf8');
const report={runId,mode,codeVersion,threadId,state,turnCompleted:completed,usage,error,abortEvidence,messages,limits:'公开 SDK 事件与实际文件分别保留；本次不是小说写作任务，不创建 Store.tasks。取消只覆盖这一实测位置，人的文学采用未发生。'};
await writeFile(resolve(runDir,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({runId,mode,threadId,state,runDir,turnCompleted:completed,error}));
if(mode==='A'?state!=='cancelled'||!abortEvidence:state!=='completed')process.exitCode=1;
