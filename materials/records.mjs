import {readFile,writeFile,mkdir,rename,readdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {dirname,resolve,relative,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

export const root=dirname(fileURLToPath(import.meta.url));
export const ids=['R01','R02','R03','R04','R05','R06','R07','R08'];
export const repairIds=['R01','R06'];
export const checkVersion='course-record-check-v1';
export const settings={modelId:'qwen-plus-2025-12-01',baseURL:'https://dashscope.aliyuncs.com/compatible-mode/v1',temperature:0,maxOutputTokens:3072,maxRetries:0,enable_thinking:false,timeout:{totalMs:60000},maxConcurrency:2};
export const sha=value=>createHash('sha256').update(value).digest('hex');
export const json=value=>JSON.stringify(value,null,2)+'\n';
export const fileRef=(path,bytes)=>({path,bytes:bytes.length,sha256:sha(bytes)});
export const readJson=async path=>JSON.parse(await readFile(path,'utf8'));

const originals={
 'inputs/reports.json':[2359,'0c7109884a5cd1c2ed1c084a6a34edf75874dd8b00ba3776540740c7e1b3f39d'],
 'inputs/teacher-reference.json':[3139,'21e21b5c9031b82579595cd44efbae49c86a826cce70140f539dab242449bf4c'],
 'prompts/instructions.txt':[176,'a044f2fafd4695188a4b4546ebc31bed7dbf553452c204c617f7bab5080fd878'],
 'prompts/task.txt':[4584,'b1b4c6d1d86b8e626b10810f5753319ac357fcac9b9e1237c27e5ba18e6e23c3'],
 'runs/extract-01/output.txt':[6741,'43b93b2d5528f8309859e008649a7ca2101f59ea83aaa7817cfa3fb88eec21a5'],
 'runs/extract-01/request-body.json':[5059,'12975894844c5b58fcf14ac97ad2c592abd660fa27c30ccf8259db6d67717525'],
 'runs/extract-01/response-body.txt':[7909,'82b453bd62ba84ce8cb307e7b8bca53a6f488cc31c3263d73d5d96697516df9c'],
 'runs/extract-01/report.json':[24100,'1e154fe6e140c8cac6684a69d4dc64d507321287a288ac7e7a64044257e62907'],
 'content-review.md':[3731,'7e9492489f30fce0a360f89d20d38affec91d68324ccf57524813c9c0e6e4345'],
 'runs/inspection.json':[43920,'65643be46100c4bc85b5f3bb5d5179fb51ddfcd5cdf3e8ab41a1334fea100082']
};

export async function loadBaseline(){
 const files={};
 for(const [path,[length,hash]] of Object.entries(originals)){
  const bytes=await readFile(join(root,path));
  assert.equal(bytes.length,length,`${path} 长度`);assert.equal(sha(bytes),hash,`${path} SHA`);
  files[path]={...fileRef(path,bytes),text:bytes.toString('utf8')};
 }
 const sources=JSON.parse(files['inputs/reports.json'].text);
 const reference=JSON.parse(files['inputs/teacher-reference.json'].text);
 const output=JSON.parse(files['runs/extract-01/output.txt'].text);
 assert.deepEqual(sources.records.map(x=>x.id),ids);
 assert.deepEqual(output.records.map(x=>x.sourceId),ids);
 return {files,sources,reference,output,report:JSON.parse(files['runs/extract-01/report.json'].text),inspection:JSON.parse(files['runs/inspection.json'].text)};
}

export function checkRecord(text,id,baseline){
 const source=baseline.sources.records.find(x=>x.id===id);
 const expected=baseline.reference.records.find(x=>x.sourceId===id);
 const old=baseline.output.records.find(x=>x.sourceId===id);
 const columns=baseline.reference.columns;
 const issues=[],evidenceChecks=[],valueChecks=[];
 let result;
 try{result=JSON.parse(text);}catch(error){return {version:checkVersion,checkState:'failed',issues:[{kind:'json',message:error.message}],result:null,evidenceChecks,valueChecks};}
 const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 if(!object(result)){return {version:checkVersion,checkState:'failed',issues:[{kind:'shape',message:'必须是一个完整字段对象。'}],result,evidenceChecks,valueChecks};}
 if(JSON.stringify(Object.keys(result).sort())!==JSON.stringify([...columns,'evidence'].sort()))issues.push({kind:'shape',message:'十一业务字段及 evidence 必须齐全，不含额外字段。'});
 if(!object(result.evidence)||JSON.stringify(Object.keys(result.evidence).sort())!==JSON.stringify(columns.slice(1).sort()))issues.push({kind:'shape',message:'evidence 必须包含十个约定字段。'});
 for(const field of columns){
  // 题名保留旧原值，含句号的六项仍待人确认；其他业务值按冻结参考核对。
  const wanted=field==='title'?old.title:expected[field];
  const actual=result[field],passed=actual===wanted;
  valueChecks.push({field,expected:wanted,actual:actual??null,passed});
  if(!passed)issues.push({kind:'value',field,expected:wanted,actual:actual??null});
 }
 for(const field of columns.slice(1)){
  const quote=result.evidence?.[field];
  const allowedNull=(field==='budgetCNY'||field==='duplicateOf')&&result[field]===null&&quote===null;
  const exact=typeof quote==='string'&&quote.length>0&&source.text.includes(quote);
  evidenceChecks.push({field,quote:quote??null,exactSubstring:exact,allowedNull,passed:exact||allowedNull});
  if(!(exact||allowedNull))issues.push({kind:'evidence',field,quote:quote??null,message:'不是本项连续原文，且不属于允许的 null 证据。'});
 }
 const contextChecks=[];
 if(id==='R06')for(const field of ['impressions','clicks','subscriptions','spendCNY']){
  const quote=result.evidence?.[field];
  const marker=typeof quote==='string'&&(quote.includes('尚未投放')||quote.includes('没有实际展示、点击、新增订阅或花费数据'));
  contextChecks.push({field,hasRequiredStatusContext:marker,semanticDecision:'仍需人阅读全文核对支持关系'});
  if(!marker)issues.push({kind:'context',field,message:'实际 null 的引用未带约定的未投放／无实际数据上下文。'});
 }
 return {version:checkVersion,checkState:issues.length?'failed':'passed',issues,result,evidenceChecks,valueChecks,contextChecks,
  contentLimit:'这是结构、固定业务值与连续引用检查；标题归属和语义采用仍待人，整批原汇总仍拒绝采用。'};
}

export async function writeExclusive(path,value){await mkdir(dirname(path),{recursive:true});await writeFile(path,json(value),{flag:'wx'});}
export async function replaceJson(path,value){
 const temp=`${path}.${randomUUID()}.tmp`;
 await writeFile(temp,json(value),{flag:'wx'});await rename(temp,path);
}
export function statePath(value){return resolve(root,value??'state/history-01');}
export async function snapshotFiles(directory){
 const files=[];
 async function visit(dir){
  for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
   const path=join(dir,entry.name);
   if(entry.isDirectory())await visit(path);
   else if(entry.isFile()){const bytes=await readFile(path);files.push({...fileRef(relative(directory,path).replaceAll('\\','/'),bytes),text:bytes.toString('utf8')});}
  }
 }
 await visit(directory);return files;
}
export async function readState(directory){
 const plan=await readJson(join(directory,'plan.json'));
 assert.deepEqual(plan.sourceIds,ids);assert.deepEqual(plan.repairIds,repairIds);
 const records=[];
 for(const id of ids)records.push(await readJson(join(directory,'items',`${id}.json`)));
 return {plan,records,summary:await readJson(join(directory,'summary.json'))};
}
