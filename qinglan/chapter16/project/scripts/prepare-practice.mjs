import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root=resolve(import.meta.dirname,'..');
const shared=resolve(root,'../../chapter10/project');
if(!existsSync(resolve(shared,'dist/cli.js')))throw Error('请先完成第十章的一次准备与构建，再开始本节。');
const input=resolve(root,'inputs/完整初始作品.json'),work=JSON.parse(readFileSync(input,'utf8'));
const id=randomUUID(),database=resolve(shared,'data','chapter16-'+id+'.sqlite');
mkdirSync(resolve(root,'data'),{recursive:true});
const pointer=resolve(shared,'practice.json');
// 新任务使用独立库，旧库及原来的入口记录继续保留。
if(existsSync(pointer))writeFileSync(resolve(root,'data','previous-practice-'+id+'.json'),readFileSync(pointer));
const result=execFileSync(process.execPath,['dist/cli.js','init',input,'--db',database,'--work',work.id],{cwd:shared,encoding:'utf8',windowsHide:true});
const practice={id,database,workId:work.id,initializedFrom:input,createdAt:new Date().toISOString()};
writeFileSync(pointer,JSON.stringify(practice,null,2)+'\n');
writeFileSync(resolve(root,'data','practice-'+id+'.json'),JSON.stringify({practice,initialWork:JSON.parse(result)},null,2)+'\n');
console.log(JSON.stringify({workId:work.id,database,sharedProject:shared,modelTasks:0}));
