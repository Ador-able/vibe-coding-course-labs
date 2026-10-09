import {generateText} from 'ai';
import {createOpenAICompatible} from '@ai-sdk/openai-compatible';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {root,repairIds,settings,checkVersion,sha,json,loadBaseline,checkRecord,statePath,readState,writeExclusive,replaceJson} from './records.mjs';

if(process.argv.length>3)throw new Error('用法：node repair-two.mjs state/history-01');
const directory=statePath(process.argv[2]),baseline=await loadBaseline(),state=await readState(directory);
assert.deepEqual(state.plan.settings,settings);
const {API_KEY:key,API_BASE_URL:baseURL,MODEL:modelId}=process.env;
if(!key||!baseURL||!modelId)throw new Error('请通过共用 scripts/run-lab.mjs 启动，先在请求观察室保存模型设置。');
const runtimeSettings={...settings,baseURL,modelId};
delete runtimeSettings.enable_thinking;
// 固定两项、固定一次，不从失败列表自动增加调用。
for(const id of repairIds)assert.equal(state.records.find(x=>x.sourceId===id).attempts.length,1);
await writeExclusive(join(directory,'repair-batch.json'),{startedAt:new Date().toISOString(),sourceIds:repairIds,settings:runtimeSettings,state:'started',actualFetchAttempts:0});
const controller=new AbortController();let interrupted=false;
const onInterrupt=()=>{interrupted=true;controller.abort(new Error('本轮操作者中断；不自动重发。'));};
process.once('SIGINT',onInterrupt);
const versions={ai:JSON.parse(await readFile(join(root,'../node_modules/ai/package.json'),'utf8')).version,
 openaiCompatible:JSON.parse(await readFile(join(root,'../node_modules/@ai-sdk/openai-compatible/package.json'),'utf8')).version};
assert.deepEqual(versions,{ai:'7.0.122',openaiCompatible:'3.0.59'});

async function execute(id){
 const attemptPath=`attempts/${id}/repair-01`,attemptDir=join(directory,attemptPath);
 await mkdir(join(directory,'attempts',id),{recursive:true});await mkdir(attemptDir);
 const prompt=await readFile(join(root,'prompts/repair',`完整教师任务-${id}.txt`),'utf8');
 const feedback=await readFile(join(root,'prompts/repair',`教师反馈-${id}.txt`),'utf8');
 const instructions=baseline.files['prompts/instructions.txt'].text;
 await writeFile(join(attemptDir,'prompt.txt'),prompt,{flag:'wx'});
 await writeFile(join(attemptDir,'feedback.txt'),feedback,{flag:'wx'});
 await writeFile(join(attemptDir,'instructions.txt'),instructions,{flag:'wx'});
 const recipe={sourceId:id,inputCollectionSHA256:baseline.files['inputs/reports.json'].sha256,settings:runtimeSettings,
  promptSHA256:sha(prompt),feedbackSHA256:sha(feedback),instructionsSHA256:sha(instructions),checkVersion};
 const recipeSHA256=sha(json(recipe));
 const item=state.records.find(x=>x.sourceId===id);
 const attempt={id:'repair-01',origin:'teacher-feedback-repair',path:attemptPath,recipe,recipeSHA256,generationState:'running',check:null};
 item.attempts.push(attempt);item.currentAttempt='repair-01';item.generationState='running';item.checkState='pending';item.contentDecision='pending';
 item.check={version:checkVersion,checkState:'pending',issues:[],result:null,contentLimit:'本项当前请求尚未检查，旧结果与旧失败在历史attempt中保留。'};
 await replaceJson(join(directory,'items',`${id}.json`),item);
 const report={sourceId:id,startedAt:new Date().toISOString(),recipe,recipeSHA256,versions,wrapperEntries:0,actualFetchAttempts:0,http:[],result:null,error:null,
  projection:'SDK结果仅保留text/finishReason/rawFinishReason/usage/warnings及response身份时间；原发送体和原响应体另存。',
  billing:'只记录实际usage，未查账单；没有据并发推算费用下降。'};
 const saveReport=()=>replaceJson(join(attemptDir,'report.json'),report);
 await saveReport();const begin=performance.now();
 const provider=createOpenAICompatible({name:'compatible',baseURL:runtimeSettings.baseURL,apiKey:key,
  fetch:async(url,init)=>{
   report.wrapperEntries++;
   if(report.wrapperEntries>1)throw new Error('本项仅允许一次 fetch 尝试；拒绝额外调用。');
   const body=String(init.body),exchange={url:String(url),method:init.method,requestAt:new Date().toISOString(),requestBody:body};
   report.http.push(exchange);
   await writeFile(join(attemptDir,'request-body.json'),body,{flag:'wx'});
   // 写入请求原件以后才计真实 fetch 尝试；不保存含密钥的请求头。
   await saveReport();
   try{
    report.actualFetchAttempts++;
    const response=await fetch(url,init);exchange.status=response.status;
    exchange.responseBody=await response.clone().text();exchange.responseAt=new Date().toISOString();
    await writeFile(join(attemptDir,'response-body.txt'),exchange.responseBody,{flag:'wx'});
    await saveReport();return response;
   }catch(error){exchange.error={name:error.name,message:error.message};await saveReport();throw error;}
  }});
 try{
  const result=await generateText({model:provider(runtimeSettings.modelId),instructions,prompt,temperature:runtimeSettings.temperature,maxOutputTokens:runtimeSettings.maxOutputTokens,
   maxRetries:0,timeout:runtimeSettings.timeout,abortSignal:controller.signal,providerOptions:{compatible:{}}});
  report.result={text:result.text,finishReason:result.finishReason,rawFinishReason:result.rawFinishReason,usage:result.usage,warnings:result.warnings,
   response:{id:result.response.id,modelId:result.response.modelId,timestamp:result.response.timestamp}};
  await writeFile(join(attemptDir,'output.txt'),result.text,{flag:'wx'});
  const check=checkRecord(result.text,id,baseline);
  await writeExclusive(join(attemptDir,'check.json'),check);
  attempt.generationState='returned';attempt.resultPath=`${attemptPath}/output.txt`;attempt.resultSHA256=sha(result.text);attempt.check=check;
  item.generationState='returned';item.checkState=check.checkState;item.check=check;
  item.contentDecision=check.checkState==='passed'?'needs_human':'rejected';
 }catch(error){
  report.error={name:error.name,message:error.message};attempt.generationState='failed';attempt.error=report.error;
  item.generationState='failed';item.checkState='failed';item.contentDecision='rejected';item.check={version:checkVersion,checkState:'failed',issues:[{kind:'generation',...report.error}],result:null};
 }finally{
  report.endedAt=new Date().toISOString();report.elapsedMs=performance.now()-begin;report.callerInterrupted=interrupted;
  report.completeSdkResultObtained=report.result!==null;
  report.failureLimit=report.error?'失败或未取得响应不证明供应商没有处理；无自动重发。':null;
  await saveReport();await replaceJson(join(directory,'items',`${id}.json`),item);
 }
 return {sourceId:id,generationState:item.generationState,checkState:item.checkState,actualFetchAttempts:report.actualFetchAttempts,error:report.error};
}

const startedAt=new Date().toISOString(),begin=performance.now();
const outcomes=await Promise.allSettled(repairIds.map(execute));
process.removeListener('SIGINT',onInterrupt);
const finished=outcomes.map((outcome,index)=>outcome.status==='fulfilled'?outcome.value:{sourceId:repairIds[index],filesystemOrSetupFailure:{name:outcome.reason.name,message:outcome.reason.message}});
const counts=[];
for(const id of repairIds){
 try{const report=JSON.parse(await readFile(join(directory,'attempts',id,'repair-01','report.json'),'utf8'));counts.push({sourceId:id,actualFetchAttempts:report.actualFetchAttempts});}
 catch(error){counts.push({sourceId:id,actualFetchAttempts:null,reason:`记录尚未取得：${error.name}`});}
}
const actualFetchAttempts=counts.every(x=>x.actualFetchAttempts!==null)?counts.reduce((sum,item)=>sum+item.actualFetchAttempts,0):null;
await replaceJson(join(directory,'repair-batch.json'),{startedAt,endedAt:new Date().toISOString(),elapsedMs:performance.now()-begin,sourceIds:repairIds,settings:runtimeSettings,
 state:'ended',actualFetchAttempts,fetchCounts:counts,outcomes:finished,scope:'固定两项各最多一次，任一失败不丢另一项已保存结果；不重算汇总、不自动采用。'});
if(finished.some(x=>x.generationState!=='returned'||x.checkState!=='passed'))process.exitCode=1;
console.log(json({directory,actualFetchAttempts,outcomes:finished,wholeBatchAdopted:false}));
