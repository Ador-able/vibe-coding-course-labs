import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const read = async path => JSON.parse(await readFile(join(root,path),'utf8'));
const records=(await read('inputs/records.json')).records;
const reference=await read('inputs/教师预置参考.json');
const stages=[];
for(const stage of ['discovery','v1','v2']){
  let report;
  try{report=await read('runs/'+stage+'-01/report.json');}catch(cause){if(cause.code==='ENOENT'){stages.push({stage,observed:false});continue;}throw cause;}
  const codebook=stage==='discovery'?null:await read('inputs/codebook-'+stage+'.json');
  const legal=new Set(codebook?.labels.map(x=>x.code));
  const rows=[],calls=[];
  for(const call of report.calls){
    const item={id:call.id,recordIds:call.recordIds,httpStatuses:call.http.map(x=>x.status),finishReason:call.result?.finishReason,usage:call.result?.usage,returned:!!call.result};
    if(!call.result){item.error=call.error;calls.push(item);continue;}
    let data;
    try{data=JSON.parse(call.result.text);item.jsonValid=true;}catch(cause){item.jsonValid=false;item.parseError=cause.message;calls.push(item);continue;}
    if(stage==='discovery'){item.candidateCount=data.candidates?.length;item.unresolved=data.unresolved;calls.push(item);continue;}
    item.version=data.codebookVersion;
    item.returnedIds=(data.items||[]).map(x=>x.id);
    item.batchIdsExact=JSON.stringify([...item.returnedIds].sort())===JSON.stringify([...call.recordIds].sort());
    for(const row of data.items||[]){
      const source=records.find(x=>x.id===row.id);
      const labels=row.labels||[];
      const codes=labels.map(x=>x.code);
      const expected=reference.v1.find(x=>x[0]===row.id);
      const expectedCodes=stage==='v2'&&reference.v2Difference[row.id]?reference.v2Difference[row.id]:expected?.[2];
      const statusKnown=['classified','unknown','other'].includes(row.status);
      const actualCodes=[...codes].sort(),truthCodes=expectedCodes?[...expectedCodes].sort():null;
      rows.push({id:row.id,status:row.status,codes,reason:row.reason,quotes:labels.map(x=>({code:x.code,quote:x.quote,literal:!!source&&typeof x.quote==='string'&&x.quote.length>0&&source.text.includes(x.quote)})),sourceExists:!!source,labelIdsLegal:codes.every(x=>legal.has(x)),duplicateLabels:codes.length!==new Set(codes).size,statusKnown,emptyStateCorrect:row.status==='classified'?codes.length>0:codes.length===0,teacherReference:{status:expected?.[1],codes:expectedCodes},statusAndWholeSetMatches:!!expected&&row.status===expected[1]&&JSON.stringify(actualCodes)===JSON.stringify(truthCodes)});
    }
    calls.push(item);
  }
  const counts={classified:0,unknown:0,other:0};
  const labelCounts={};
  for(const row of rows){if(row.status in counts)counts[row.status]++;for(const code of new Set(row.codes))labelCounts[code]=(labelCounts[code]||0)+1;}
  stages.push({stage,observed:true,codebookVersion:codebook?.version,requestCount:report.requestCount,calls,rows,statusCounts:counts,labelCounts,distinctRecords: new Set(rows.map(x=>x.id)).size,submittedRecords:records.length,wholeRowsMatchTeacherReference:rows.filter(x=>x.statusAndWholeSetMatches).length,allRowsPresent:rows.length===records.length&&new Set(rows.map(x=>x.id)).size===records.length,contentPassed:null,limits:'原句存在不证明所贴主题适用；与明示教师口径一致不等于未知真实反馈的分类质量。'});
}
await writeFile(join(root,'runs/mechanical-inspection.json'),JSON.stringify({classificationUnit:'一条完整反馈',stages},null,2)+'\n');
console.log(JSON.stringify(stages.map(x=>({stage:x.stage,observed:x.observed,rows:x.rows?.length,teacherMatches:x.wholeRowsMatchTeacherReference,status:x.statusCounts,labels:x.labelCounts}))));

