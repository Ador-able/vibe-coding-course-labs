import {getCodeVersion} from '../dist/version.js';
import {spawnSync,execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const root=process.cwd(),database=resolve('data/fanren/feedback.sqlite'),out=resolve('runs/人工准备');
try{await access(database);throw new Error('本节数据库已存在，不自动清库或重复保存。');}
catch(error){if(error.code!=='ENOENT')throw error;}
await mkdir(out,{recursive:true});
const steps=[
 ['初始化',['init','seed/新作品.json']],
 ['人工r1',['save','seed/人工草稿-r1.json']],
 ['人工r2',['save','seed/人工草稿-r2.json']],
 ['完整当前对象',['show']],
 ['完整当前章节',['chapter','1']],
];
const results=[];
for(const [label,args]of steps){
 const argv=['dist/cli.js',...args,'--db',database,'--work','fanren'];
 const result=spawnSync(process.execPath,argv,{cwd:root,encoding:'utf8',windowsHide:true});
 await writeFile(resolve(out,label+'.stdout.json'),result.stdout??'');
 await writeFile(resolve(out,label+'.stderr.txt'),result.stderr??'');
 results.push({label,argv,status:result.status,error:result.error?.message??null});
 await writeFile(resolve(out,'真实CLI调用.json'),JSON.stringify(results,null,2));
 if(result.status!==0)throw new Error(`${label}失败，已保存原返回，不继续下一步。`);
}
const db=new DatabaseSync(database,{readOnly:true});
let tables;
try{tables=Object.fromEntries(['works','work_versions','chapters','chapter_versions','tasks'].map(table=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()]));}
finally{db.close();}
const counts=Object.fromEntries(Object.entries(tables).map(([name,rows])=>[name,rows.length]));
assert.deepEqual(counts,{works:1,work_versions:1,chapters:1,chapter_versions:2,tasks:0});
const expectedWork=JSON.parse(await readFile('seed/新作品.json','utf8'));
assert.deepEqual({...JSON.parse(tables.works[0].content),revision:tables.works[0].revision},{...expectedWork,revision:1});
const revisions=tables.chapter_versions.map(row=>JSON.parse(row.content)).sort((a,b)=>a.revision-b.revision);
for(const revision of revisions){
 const expected=JSON.parse(await readFile(`seed/人工草稿-r${revision.revision}.json`,'utf8'));
 assert.equal(revision.body,expected.body);assert.equal(revision.title,expected.title);
 assert.equal(revision.origin,'human');assert.equal(revision.status,'draft');
 assert.equal(revision.workRevision,1);assert.equal(revision.taskId,null);assert.equal(revision.threadId,null);
}
assert.deepEqual(JSON.parse(tables.chapters[0].content),revisions[1]);
await writeFile(resolve(out,'五表人工基线.json'),JSON.stringify(tables,null,2));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={root,database,codeVersion:getCodeVersion(),counts,workRevision:1,currentChapterRevision:2,origin:'human',revisions:[1,2],databaseSha256:sha(await readFile(database)),modelCalls:0,hookCalls:0,limits:'人工CLI真实保存两版并完整读回；未通过Agent工具调用，不触发Agent PostToolUse，不证明AI已采用反馈方法。'};
await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
