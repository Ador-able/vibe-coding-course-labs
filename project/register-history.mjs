import {mkdir,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import assert from 'node:assert/strict';
import {loadBaseline,checkRecord,checkVersion,ids,repairIds,settings,sha,json,statePath,writeExclusive} from './records.mjs';

if(process.argv.length>3)throw new Error('用法：node register-history.mjs state/history-01');
const directory=statePath(process.argv[2]),baseline=await loadBaseline();
await mkdir(dirname(directory),{recursive:true});await mkdir(directory); // 同一历史登记不覆盖已有状态。
const sourceFile=baseline.files['inputs/reports.json'];
const sourceRef={path:sourceFile.path,bytes:sourceFile.bytes,sha256:sourceFile.sha256};
const recipe={origin:'187-single-request',model:baseline.report.settings,inputCollectionSHA256:sourceRef.sha256,instructionsSHA256:baseline.files['prompts/instructions.txt'].sha256,promptSHA256:baseline.files['prompts/task.txt'].sha256,checkVersion};
const recipeSHA256=sha(json(recipe)),initialItemSHA256={};
for(const id of ids){
 const original=baseline.output.records.find(x=>x.sourceId===id),text=json(original);
 const resultPath=`history-records/${id}.json`,check=checkRecord(text,id,baseline);
 await mkdir(join(directory,'history-records'),{recursive:true});
 await writeFile(join(directory,resultPath),text,{flag:'wx'});
 const record={sourceId:id,input:{...sourceRef,record:baseline.sources.records.find(x=>x.id===id)},generationState:'returned',checkState:check.checkState,
  contentDecision:check.checkState==='failed'?'rejected':'needs_human',currentAttempt:'187-extract-01',
  attempts:[{id:'187-extract-01',origin:'187-single-request',representation:'格式化派生对象；完整原八项回答及单次HTTP原件保留。',requestPath:'runs/extract-01/request-body.json',responsePath:'runs/extract-01/response-body.txt',
   requestSHA256:baseline.files['runs/extract-01/request-body.json'].sha256,responseSHA256:baseline.files['runs/extract-01/response-body.txt'].sha256,
   resultPath,resultSHA256:sha(text),recipe,recipeSHA256,generationState:'returned',checkOrigin:'本节零模型历史登记',check}],check};
 const itemPath=join(directory,'items',`${id}.json`);await writeExclusive(itemPath,record);initialItemSHA256[id]=sha(json(record));
}
const failed=ids.filter(id=>checkRecord(json(baseline.output.records.find(x=>x.sourceId===id)),id,baseline).checkState==='failed');
assert.deepEqual(failed,repairIds);
await writeExclusive(join(directory,'summary.json'),{decision:'rejected',modelAccepted:false,original:baseline.output.summary,
 originalOutput:((({text,...file})=>file)(baseline.files['runs/extract-01/output.txt'])),problems:baseline.inspection.summaryFailures,scope:'保持原汇总全文；本节局部重做不重算或采用统计。'});
await writeExclusive(join(directory,'plan.json'),{sourceIds:ids,repairIds,settings,checkVersion,initialItemSHA256,historicalRequestCount:1,
 originalFiles:Object.values(baseline.files).map(({text,...file})=>file),scope:'八项历史对象来自同一次187请求；只允许R01和R06各一次新请求。'});
console.log(json({directory,sourceIds:ids,failedIds:failed,historicalRequestCount:1,newRequestCount:0,contentDecision:'整批未采用'}));
