import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {generateText} from 'ai';
import {createOpenAICompatible} from '@ai-sdk/openai-compatible';
import {root,runDir,versions,frozen,sha,json,writeNew} from './comparison-common.mjs';
assert.equal(process.argv.length,2,'用法：node compare-templates.mjs');
const baseline=await frozen(),key=process.env.DASHSCOPE_API_KEY;
assert(key,'请仅在本次进程提供已有授权密钥；未发送请求。');
const actualVersions={ai:JSON.parse(await fs.readFile(path.join(root,'node_modules/ai/package.json'),'utf8')).version,openaiCompatible:JSON.parse(await fs.readFile(path.join(root,'node_modules/@ai-sdk/openai-compatible/package.json'),'utf8')).version};
assert.deepEqual(actualVersions,baseline.settings.versions);
const codeHead=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
await fs.mkdir(path.dirname(runDir),{recursive:true});await fs.mkdir(runDir);
const controller=new AbortController();const interrupt=()=>controller.abort(new Error('操作者中断；不自动重发。'));process.once('SIGINT',interrupt);
const batch={startedAt:new Date().toISOString(),codeHead,actualVersions,settings:baseline.settings,order:versions,actualFetchAttempts:0,outcomes:[],scope:'同一十份完整材料；V1、V2各一次，顺序执行；原始请求/响应正文完整保存，秘密头不保存。'};
const begin=performance.now();
for(const version of versions){
 const directory=path.join(runDir,version);await fs.mkdir(directory);
 const prompt=baseline.prompts[version],instructions=baseline.instructions;
 await fs.writeFile(path.join(directory,'prompt.txt'),prompt,{flag:'wx'});await fs.writeFile(path.join(directory,'instructions.txt'),instructions,{flag:'wx'});
 const report={version,startedAt:new Date().toISOString(),codeHead,settings:baseline.settings,promptSHA256:sha(prompt),instructionsSHA256:sha(instructions),inputCollectionSHA256:sha(await fs.readFile(path.join(root,'comparison-inputs/07-本轮完整十份日报.json'))),wrapperEntries:0,actualFetchAttempts:0,http:[],result:null,error:null};
 const save=()=>fs.writeFile(path.join(directory,'report.json'),json(report));await save();const start=performance.now();
 if(controller.signal.aborted){report.error={name:'NotStartedError',message:'操作者已中断；本版未开始请求。'};report.endedAt=new Date().toISOString();report.elapsedMs=0;await save();batch.outcomes.push({version,state:'not_started',actualFetchAttempts:0,error:report.error});continue;}
 const provider=createOpenAICompatible({name:baseline.settings.providerName,baseURL:baseline.settings.baseURL,apiKey:key,fetch:async(url,init)=>{
  report.wrapperEntries++;assert.equal(report.wrapperEntries,1,'每版最多一次请求尝试');
  const body=String(init.body),exchange={url:String(url),method:init.method,requestAt:new Date().toISOString()};report.http.push(exchange);
  await fs.writeFile(path.join(directory,'request-body.json'),body,{flag:'wx'});await save();
  report.actualFetchAttempts++;batch.actualFetchAttempts++;
  try{const response=await fetch(url,init);exchange.status=response.status;exchange.responseAt=new Date().toISOString();await fs.writeFile(path.join(directory,'response-body.txt'),await response.clone().text(),{flag:'wx'});await save();return response;}
  catch(error){exchange.error={name:error.name,message:error.message};await save();throw error;}
 }});
 try{
  const result=await generateText({model:provider(baseline.settings.modelId),instructions,prompt,temperature:baseline.settings.temperature,maxOutputTokens:baseline.settings.maxOutputTokens,maxRetries:0,timeout:baseline.settings.timeout,abortSignal:controller.signal,providerOptions:baseline.settings.providerOptions});
  report.result={text:result.text,finishReason:result.finishReason,rawFinishReason:result.rawFinishReason,usage:result.usage,warnings:result.warnings,response:{id:result.response.id,modelId:result.response.modelId,timestamp:result.response.timestamp}};
  await fs.writeFile(path.join(directory,'output.txt'),result.text,{flag:'wx'});
 }catch(error){report.error={name:error.name,message:error.message};}
 report.endedAt=new Date().toISOString();report.elapsedMs=performance.now()-start;await save();
 batch.outcomes.push({version,state:report.result?'returned':'failed',actualFetchAttempts:report.actualFetchAttempts,error:report.error});
}
process.removeListener('SIGINT',interrupt);batch.endedAt=new Date().toISOString();batch.elapsedMs=performance.now()-begin;assert(batch.actualFetchAttempts<=2);await writeNew(path.join(runDir,'batch.json'),batch);
console.log(json({codeHead,actualFetchAttempts:batch.actualFetchAttempts,outcomes:batch.outcomes}));if(batch.outcomes.some(o=>o.state!=='returned'))process.exitCode=1;
