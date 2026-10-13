import {checkedTaskRuntime} from './task-runtime.mjs';
import {getCodeVersion} from '../dist/version.js';
import {Codex} from '@openai/codex-sdk';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';

const {values}=parseArgs({options:{folder:{type:'string',default:'replan'}}});
const task=JSON.parse(await readFile(resolve(values.folder,'task.json'),'utf8')),prompt=await readFile(resolve(values.folder,'完整重规划输入.txt'),'utf8');
const runId=randomUUID(),runDir=resolve('runs',`replanning-${runId}`);await mkdir(runDir,{recursive:true});
const codeVersion=getCodeVersion();
const {runtime,options}=checkedTaskRuntime();
// 使用官方 Harness 的新会话；公开输入与事件原样保留，不自行实现工具循环。
const thread=new Codex(runtime).startThread(options);
await writeFile(resolve(runDir,'input.json'),JSON.stringify({runId,codeVersion,runtime,options,task,prompt,scope:'本次只核对实际材料并调整计划，不生成或改写小说；公共任务输入和 SDK 事件可回查，不声称包含宿主隐藏配置或供应商原始网络请求。'},null,2));
let threadId=null,completed=false,error=null,usage=null;const messages=[];
console.log(JSON.stringify({runId,runDir,codeVersion,state:'running'}));
try{const {events}=await thread.runStreamed(prompt,{signal:AbortSignal.timeout(600000)});for await(const event of events){await appendFile(resolve(runDir,'events.jsonl'),JSON.stringify(event)+'\n');if(event.type==='thread.started')threadId=event.thread_id;if(event.type==='turn.completed'){completed=true;usage=event.usage;}if(event.type==='turn.failed')error=event.error.message;if(event.type==='error')error=event.message;if(event.type==='item.completed'&&event.item.type==='agent_message')messages.push(event.item.text);console.log(JSON.stringify({event:event.type,itemType:event.item?.type,status:event.item?.status}));}}
catch(cause){error=cause instanceof Error?cause.message:String(cause);}
const state=error?'failed':completed?'completed':'interrupted';
await writeFile(resolve(runDir,'final-response.txt'),messages.join('\n\n'),'utf8');
await writeFile(resolve(runDir,'report.json'),JSON.stringify({runId,codeVersion,threadId,state,turnCompleted:completed,usage,error,messages,limits:'结束事件只说明本次会话结束；计划里的修改、保存、导出和人的阅读是否发生须另核实际对象与文件。'},null,2));
console.log(JSON.stringify({runId,runDir,threadId,state,error}));if(state!=='completed')process.exitCode=1;
