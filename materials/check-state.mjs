import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {root,ids,repairIds,settings,sha,json,readJson,loadBaseline,checkRecord,statePath,readState,snapshotFiles,writeExclusive} from './records.mjs';

if(process.argv.length>4)throw new Error('用法：node check-state.mjs state/history-01 runs/check-01.json');
const directory=statePath(process.argv[2]),receipt=resolve(root,process.argv[3]??'runs/check-01.json');
assert.ok(!receipt.startsWith(directory+'/')&&!receipt.startsWith(directory+'\\'),'核对回执不能写入状态目录');
const before=await snapshotFiles(directory),baseline=await loadBaseline(),state=await readState(directory),checks=[];
assert.deepEqual(state.records.map(x=>x.sourceId),ids);assert.equal(state.plan.historicalRequestCount,1);
assert.deepEqual(state.summary.original,baseline.output.summary);assert.equal(state.summary.decision,'rejected');
for(const item of state.records){
 const old=item.attempts[0];assert.equal(old.origin,'187-single-request');
 const oldText=await readFile(join(directory,old.resultPath),'utf8');
 assert.equal(sha(oldText),old.resultSHA256);assert.deepEqual(JSON.parse(oldText),baseline.output.records.find(x=>x.sourceId===item.sourceId));
 assert.deepEqual(old.check,checkRecord(oldText,item.sourceId,baseline));
 if(!repairIds.includes(item.sourceId))assert.equal(sha(await readFile(join(directory,'items',`${item.sourceId}.json`))),state.plan.initialItemSHA256[item.sourceId]);
 assert.equal(item.attempts.length,repairIds.includes(item.sourceId)?2:1);
 if(repairIds.includes(item.sourceId)){
  const current=item.attempts[1],dir=join(directory,current.path),report=await readJson(join(dir,'report.json'));
  assert.equal(report.sourceId,item.sourceId);const actualSettings=report.recipe.settings;
  // 新请求按本次配方核对；历史设置不冒充当前模型。
  assert.equal(typeof actualSettings.modelId,'string');assert.ok(actualSettings.modelId);
  assert.equal(typeof actualSettings.baseURL,'string');assert.ok(actualSettings.baseURL);
  assert.deepEqual({...actualSettings,modelId:settings.modelId,baseURL:settings.baseURL},settings);
  assert.deepEqual(current.recipe,report.recipe);assert.equal(report.recipeSHA256,sha(json(report.recipe)));assert.equal(current.recipeSHA256,report.recipeSHA256);
  assert.ok(report.actualFetchAttempts===0||report.actualFetchAttempts===1);assert.ok(report.wrapperEntries===0||report.wrapperEntries===1);
  const prompt=await readFile(join(dir,'prompt.txt'),'utf8'),instructions=await readFile(join(dir,'instructions.txt'),'utf8');
  assert.equal(prompt,await readFile(join(root,'prompts/repair',`完整教师任务-${item.sourceId}.txt`),'utf8'));
  assert.equal(instructions,baseline.files['prompts/instructions.txt'].text);
  if(report.actualFetchAttempts===1){
   const requestText=await readFile(join(dir,'request-body.json'),'utf8'),request=JSON.parse(requestText);
   assert.equal(report.http.length,1);assert.equal(report.http[0].requestBody,requestText);
   assert.equal(request.model,actualSettings.modelId);assert.equal(report.http[0].url,actualSettings.baseURL.replace(/\/$/,'')+'/chat/completions');assert.equal(request.max_tokens,3072);assert.equal(request.temperature,0);assert.equal(request.enable_thinking,false);
   assert.equal(request.tools,undefined);assert.equal(request.stream,undefined);
   assert.deepEqual(request.messages,[{role:'system',content:instructions},{role:'user',content:prompt}]);
   if(report.http[0].responseBody!==undefined)assert.equal(report.http[0].responseBody,await readFile(join(dir,'response-body.txt'),'utf8'));
  }else{assert.equal(report.result,null);assert.equal(item.generationState,'failed');assert.ok(report.error);}
  if(report.result){
   const text=await readFile(join(dir,'output.txt'),'utf8');assert.equal(text,report.result.text);assert.equal(sha(text),current.resultSHA256);
   const response=JSON.parse(report.http[0].responseBody);assert.equal(response.choices[0].message.content,text);
   assert.deepEqual(item.check,checkRecord(text,item.sourceId,baseline));assert.deepEqual(current.check,item.check);
   assert.equal(report.result.usage.inputTokens,response.usage.prompt_tokens);assert.equal(report.result.usage.outputTokens,response.usage.completion_tokens);
  }
  checks.push({sourceId:item.sourceId,generationState:item.generationState,checkState:item.checkState,contentDecision:item.contentDecision,issues:item.check.issues,
   wrapperEntries:report.wrapperEntries,actualFetchAttempts:report.actualFetchAttempts,rawError:report.error,recipeSHA256:current.recipeSHA256});
 }else checks.push({sourceId:item.sourceId,historicalItemBytesUnchanged:true,checkState:item.checkState,contentDecision:item.contentDecision,recipeSHA256:old.recipeSHA256});
}
const after=await snapshotFiles(directory);assert.deepEqual(after,before);
await writeExclusive(receipt,{scope:'只核本地已有请求、完整原答与逐项状态；没有SDK、环境变量读取、HTTP或新模型。不是内容采用。',sourceIds:ids,checks,
 summaryDecision:state.summary.decision,stateBytesUnchanged:true,before:before.map(({text,...file})=>file),after:after.map(({text,...file})=>file)});
console.log(json({receipt,stateBytesUnchanged:true,checks,summaryDecision:state.summary.decision}));
