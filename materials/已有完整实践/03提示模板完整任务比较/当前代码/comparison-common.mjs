import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const root=import.meta.dirname,inputDir=path.join(root,'comparison-inputs'),runDir=path.join(root,'comparison-runs','comparison-01');
export const versions=['V1','V2'];
export const columns=['sourceId','campaignId','date','title','status','impressions','clicks','subscriptions','spendCNY','budgetCNY','duplicateOf'];
export const evidenceFields=columns.slice(1),numbers=['impressions','clicks','subscriptions','spendCNY','budgetCNY'];
export const sha=b=>createHash('sha256').update(b).digest('hex'),json=x=>JSON.stringify(x,null,2)+'\n';
export const readJson=async file=>JSON.parse(await fs.readFile(file,'utf8'));
export const writeNew=async(file,value)=>fs.writeFile(file,json(value),{flag:'wx'});
export async function frozen(){
 const manifest=await readJson(path.join(inputDir,'冻结完整输入清单.json'));
 for(const item of manifest.allCopies){const raw=await fs.readFile(path.join(inputDir,item.name));assert.equal(raw.length,item.bytes);assert.equal(sha(raw),item.sha256,item.name);}
 const settings=await readJson(path.join(inputDir,'12-非秘密固定设置.json'));
 const instructions=await fs.readFile(path.join(inputDir,'09-共同整理规则.txt'),'utf8');
 const collection=await readJson(path.join(inputDir,'07-本轮完整十份日报.json'));
 const reference=await readJson(path.join(inputDir,'08-本轮独立参考.json'));
 const prompts={V1:await fs.readFile(path.join(inputDir,'10-V1完整教师任务.txt'),'utf8'),V2:await fs.readFile(path.join(inputDir,'11-V2完整教师任务.txt'),'utf8')};
 const addition=await fs.readFile(path.join(inputDir,'13-V2相对V1唯一增加段.txt'),'utf8');
 assert.equal(prompts.V2.replace(addition,''),prompts.V1);
 for(const prompt of Object.values(prompts))assert.deepEqual(JSON.parse(prompt.split('完整材料：\n')[1]),collection.records);
 assert.equal(collection.records.length,10);assert.deepEqual(reference.columns,columns);
 return {manifest,settings,instructions,collection,reference,prompts};
}
export function parseCandidate(text){try{return {value:JSON.parse(text),error:null};}catch(error){return {value:null,error:{name:error.name,message:error.message}};}}
export function recordShape(row){
 const problems=[];
 if(!row||typeof row!=='object'||Array.isArray(row))return ['记录应为对象'];
 const keys=Object.keys(row).sort();if(JSON.stringify(keys)!==JSON.stringify([...columns,'evidence'].sort()))problems.push('字段须为11业务字段及evidence，不增加或遗漏');
 for(const k of ['sourceId','campaignId','date','title','status'])if(typeof row[k]!=='string')problems.push(k+'须为字符串');
 if(typeof row.date==='string'&&!/^\d{4}-\d{2}-\d{2}$/.test(row.date))problems.push('date格式不符');
 if(!['observed','planned'].includes(row.status))problems.push('status范围不符');
 for(const k of numbers)if(row[k]!==null&&(typeof row[k]!=='number'||!Number.isFinite(row[k])||row[k]<0||(['impressions','clicks','subscriptions'].includes(k)&&!Number.isInteger(row[k]))))problems.push(k+'须为非负数值或null，次数为整数');
 if(row.duplicateOf!==null&&typeof row.duplicateOf!=='string')problems.push('duplicateOf须为字符串或null');
 const e=row.evidence;if(!e||typeof e!=='object'||Array.isArray(e))problems.push('evidence须为对象');
 else {if(JSON.stringify(Object.keys(e).sort())!==JSON.stringify([...evidenceFields].sort()))problems.push('evidence须有十项');for(const k of evidenceFields)if(typeof e[k]!=='string'&&!(e[k]===null&&['budgetCNY','duplicateOf'].includes(k)&&row[k]===null))problems.push('证据'+k+'类型不符或实际有值而缺证据');}
 return problems;
}
