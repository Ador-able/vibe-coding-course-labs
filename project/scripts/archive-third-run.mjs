import {mkdir,readFile,writeFile,copyFile,cp} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';

const output=resolve('evidence/03-资源提示与插件');
await mkdir(output,{recursive:true});
const runs=[['未安装宿主检查','cdd83d2b-d7ea-4d81-9d30-5d364f11ef4f'],['安装后只读-旧核查','260af8b6-fd66-44fa-9f95-709f18713dee'],['安装后只读-实际通过','b8f183d8-a8eb-4380-a287-f0a3c4b618ce']];
for(const [name,id] of runs){
  const dir=resolve(output,name);await mkdir(dir,{recursive:true});
  for(const file of ['input.json','events.jsonl','report.json','final-response.txt'])await copyFile(resolve('runs',`plugin-${id}`,file),resolve(dir,file));
}
const report=JSON.parse(await readFile(resolve(output,'安装后只读-实际通过/report.json'),'utf8'));
assert.equal(report.passed,true);assert.equal(report.verifiedReads,true);assert.equal(report.unchanged,true);
const events=(await readFile(resolve(output,'安装后只读-实际通过/events.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
const commands=events.filter(event=>event.type==='item.completed'&&event.item.type==='command_execution'&&event.item.exit_code===0).map(event=>event.item);
const normalize=value=>value.replaceAll('\r\n','\n').trim();
const skill=normalize(await readFile('plugins/novel-practice/skills/novel-chapter-task/SKILL.md','utf8'));
const reference=normalize(await readFile('plugins/novel-practice/skills/novel-chapter-task/references/state-and-review.md','utf8'));
assert(commands.some(item=>normalize(item.aggregated_output).includes(skill)&&normalize(item.aggregated_output).includes(reference)));
await cp('data/插件临时安装检查-最终核查',resolve(output,'安装与撤销-最终核查'),{recursive:true});
for(const file of ['资源与提示实际读取.json','插件安装回执.json','插件最终移除回执.json','插件配置实际加载-default.json','插件配置实际加载-false.json','插件配置实际加载-true.json'])await copyFile(resolve('data',file),resolve(output,file));
const restoration=JSON.parse(await readFile(resolve(output,'安装与撤销-最终核查/最终移除后验证.json'),'utf8'));
assert.equal(restoration.semanticRestored,true);assert.equal(restoration.rawHashRestored,true);assert.equal(restoration.ownEntry,null);assert.equal(restoration.cacheExists,false);
const resourceReport=JSON.parse(await readFile(resolve(output,'资源与提示实际读取.json'),'utf8'));
await writeFile(resolve(output,'核查摘要.json'),JSON.stringify({inspectionId:report.inspectionId,threadId:report.threadId,codeVersion:report.codeVersion,actualReads:report.toolCalls.filter(call=>call.status==='completed'&&!call.error).map(call=>({server:call.server,tool:call.tool,arguments:call.arguments})),skillAndReferenceContentMatched:true,businessUnchanged:true,restoration,resourceReportFields:Object.keys(resourceReport),limits:'资源和提示由独立 MCP 客户端读取，不证明宿主自动采用；插件仅实测读取，没有插件写入。'},null,2));
console.log(JSON.stringify({output,inspectionId:report.inspectionId,skillAndReferenceContentMatched:true,businessUnchanged:true,globalConfigRestored:true}));
