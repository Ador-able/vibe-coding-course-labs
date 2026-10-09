import {DatabaseSync} from 'node:sqlite';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {parseArgs} from 'node:util';

const {values}=parseArgs({options:{db:{type:'string'}}});
if(!values.db)throw new Error('需要本节独立数据库路径。');
const root=process.cwd(),database=resolve(values.db),out=resolve('runs','teacher-check');
const source=JSON.parse(await readFile('materials/检查来源.json','utf8'));
assert.equal(database,resolve(source.database),'教师检查必须指向本节独立库');
const expectedBytes=await readFile(source.expectedSnapshot);
const expected=JSON.parse(expectedBytes.toString('utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const snapshot=()=>{
  const db=new DatabaseSync(database,{readOnly:true});
  try{
    // SQL 行转为普通对象，只比较实际字段，不用原型差异制造业务错误。
    return JSON.parse(JSON.stringify(Object.fromEntries(['works','work_versions','chapters','chapter_versions','tasks'].map(table=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()]))));
  }finally{db.close();}
};
await mkdir(out,{recursive:true});
const before=snapshot();
const input={root,database,source,nodeVersion:process.versions.node,gitHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),expectedSnapshotSha256:hash(expectedBytes),programPath:'materials/check-current.mjs',programSha256:hash(await readFile('materials/check-current.mjs')),scope:'只读五表和原导出，不启动模型/宿主，不改业务，不重新生成导出。'};
await writeFile(resolve(out,'input.json'),JSON.stringify(input,null,2)+'\n');
await writeFile(resolve(out,'before-five-tables.json'),JSON.stringify(before,null,2)+'\n');
let report,error=null;
try{
  assert.deepEqual(before,expected,'当前完整五表必须与继承原件相同');
  const workRow=before.works.find(row=>row.id===source.workId);
  assert.ok(workRow,'指定作品必须存在');
  const work={...JSON.parse(workRow.content),revision:workRow.revision};
  const chapters=before.chapters.filter(row=>row.work_id===source.workId).map(row=>JSON.parse(row.content)).sort((a,b)=>a.number-b.number);
  assert.equal(work.revision,source.expectedWorkRevision);
  assert.deepEqual(chapters.map(chapter=>chapter.number),source.expectedChapterNumbers);
  const exportBytes=await readFile(source.inheritedExport);
  assert.equal(exportBytes.length,source.inheritedExportBytes);
  assert.equal(hash(exportBytes),source.inheritedExportSha256);
  report={work,chapters:chapters.map(chapter=>({number:chapter.number,title:chapter.title,revision:chapter.revision,status:chapter.status,workRevision:chapter.workRevision,previousRevisions:chapter.previousRevisions,origin:chapter.origin,hanCount:[...chapter.body.matchAll(/\p{Script=Han}/gu)].length,utf16Length:chapter.body.length,codePointLength:[...chapter.body].length,bodyUtf8Bytes:Buffer.byteLength(chapter.body),bodySha256:hash(Buffer.from(chapter.body,'utf8'))})),counts:Object.fromEntries(Object.entries(before).map(([table,rows])=>[table,rows.length])),fullFiveTablesEqualInherited:true,chapterNumbersEqualExpected:true,statisticalScope:'hanCount仅统计Unicode Script=Han，另列UTF-16和码点长度；不判断因果、权限、表达或文学合格。',inheritedExport:{path:source.inheritedExport,bytes:exportBytes.length,sha256:hash(exportBytes),matchesRecordedOriginal:true,scope:'07-06真实导出原件；继承完整五表核同。本次未调用导出，后续实际export_work返回另行逐字核。'},modelOrHostStarted:false,businessWritten:false};
}catch(cause){error=cause instanceof Error?{message:cause.message,stack:cause.stack}:String(cause);report={error,modelOrHostStarted:false,businessWritten:false};}
const after=snapshot();
await writeFile(resolve(out,'after-five-tables.json'),JSON.stringify(after,null,2)+'\n');
try{assert.deepEqual(after,before,'教师检查前后完整五表必须不变');report.fullFiveTablesUnchanged=true;}
catch(cause){error={message:cause.message,stack:cause.stack};report.postCheckError=error;}
await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
await writeFile('materials/当前产物程序核对.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(error)process.exitCode=1;
