import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {runDir,versions,columns,evidenceFields,frozen,parseCandidate,recordShape,writeNew} from './comparison-common.mjs';
assert.equal(process.argv.length,2);assert(!process.env.DASHSCOPE_API_KEY,'此进程不提供模型密钥。');
const baseline=await frozen(),outcomes=[];
for(const version of versions){
 const directory=path.join(runDir,version),report=JSON.parse(await fs.readFile(path.join(directory,'report.json'),'utf8'));
 const parsed=report.result?parseCandidate(await fs.readFile(path.join(directory,'output.txt'),'utf8')):{value:null,error:report.error};
 const check={version,createdAt:new Date().toISOString(),parseError:parsed.error,formatIssues:[],coverageIssues:[],valueIssues:[],evidenceSubstringIssues:[],summaryIssues:[],titleDecisions:baseline.reference.titleChecks,semanticDecision:'pending',wholeTaskAdopted:false,scope:'只检查结构、值、连续子串与冻结汇总；逐条证据是否支持字段及limits含义留给人工。'};
 const value=parsed.value??{};
 if(!parsed.error){
  if(!value||typeof value!=='object'||Array.isArray(value)||JSON.stringify(Object.keys(value).sort())!==JSON.stringify(['records','summary']))check.formatIssues.push('顶层须仅有records和summary');
  if(!Array.isArray(value.records))check.formatIssues.push('records须为数组');
  else {
   const ids=value.records.map(r=>r?.sourceId),expected=baseline.collection.records.map(r=>r.id);
   if(ids.length!==expected.length||new Set(ids).size!==ids.length||expected.some(id=>!ids.includes(id)))check.coverageIssues.push({expectedIds:expected,actualIds:ids});
   for(const row of value.records){
    const id=row?.sourceId,issues=recordShape(row);if(issues.length)check.formatIssues.push({sourceId:id,issues});
    const gold=baseline.reference.records.find(r=>r.sourceId===id),input=baseline.collection.records.find(r=>r.id===id),title=baseline.reference.titleChecks.find(r=>r.sourceId===id);
    if(gold)for(const field of columns){const matches=field==='title'?title.acceptedValues.includes(row[field]):row[field]===gold[field];if(!matches)check.valueIssues.push({sourceId:id,field,actual:row[field],expected:field==='title'?title.acceptedValues:gold[field]});}
    if(input&&row.evidence&&typeof row.evidence==='object')for(const field of evidenceFields){const quote=row.evidence[field];if(typeof quote==='string'&&(!quote.length||!input.text.includes(quote)))check.evidenceSubstringIssues.push({sourceId:id,field,quote});}
   }
  }
  const summary=value.summary,gold=baseline.reference.summary;
  if(!summary||typeof summary!=='object'||Array.isArray(summary)||JSON.stringify(Object.keys(summary).sort())!==JSON.stringify([...Object.keys(gold),'limits'].sort()))check.summaryIssues.push('summary字段不完整或增加未知字段');
  if(summary)for(const [field,expected] of Object.entries(gold)){const actual=summary[field];const equal=Array.isArray(expected)?Array.isArray(actual)&&new Set(actual).size===actual.length&&actual.length===expected.length&&expected.every(id=>actual.includes(id)):typeof actual==='number'&&Math.abs(actual-expected)<1e-12;if(!equal)check.summaryIssues.push({field,actual,expected});}
 }
 check.mechanicalState=!check.parseError&&['formatIssues','coverageIssues','valueIssues','evidenceSubstringIssues','summaryIssues'].every(k=>check[k].length===0)?'passed':'failed';
 await writeNew(path.join(directory,'inspection.json'),check);outcomes.push({version,mechanicalState:check.mechanicalState,counts:Object.fromEntries(['formatIssues','coverageIssues','valueIssues','evidenceSubstringIssues','summaryIssues'].map(k=>[k,check[k].length])),semanticDecision:'pending'});
}
console.log(JSON.stringify(outcomes));
