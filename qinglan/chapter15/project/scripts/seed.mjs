import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {parseArgs} from 'node:util';
import {Store} from '../dist/store.js';

export const tables=['works','work_versions','chapters','chapter_versions','tasks'];
export function snapshot(store){
  return Object.fromEntries(tables.map(name=>[name,store.db.prepare(`SELECT * FROM ${name} ORDER BY 1,2`).all().map(row=>({...row}))]));
}
export function seed(store){
  const bytes=readFileSync(new URL('../inputs/完整教师初始化.json',import.meta.url)),input=JSON.parse(bytes);
  const work=store.init(input.work),chapters=[];
  for(const chapter of input.chapters)chapters.push(store.saveDraft({workId:work.id,chapterNumber:chapter.number,expectedWorkRevision:work.revision,expectedChapterRevision:0,expectedPreviousRevisions:chapters.map(item=>({number:item.number,revision:item.revision})),title:chapter.title,body:chapter.body},'human'));
  return {kind:input.kind,source:input.source,inputSha256:createHash('sha256').update(bytes).digest('hex'),scope:input.scope,work,chapters,export:store.exportWork(work.id),fiveTables:snapshot(store)};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename)){
  const {values}=parseArgs({options:{name:{type:'string'}}}),id=values.name??randomUUID();
  if(!/^[a-zA-Z0-9-]+$/.test(id))throw new Error('练习名称只用字母、数字和连字符。');
  const directory=resolve('runs',`prepare-${id}`),database=resolve('data',`practice-${id}.sqlite`);
  if(existsSync(directory)||existsSync(database))throw new Error('同名练习已存在，请换新名称；不会覆盖原件。');
  mkdirSync(directory,{recursive:true});const store=new Store(database);let result;
  try{result=seed(store);}finally{store.close();}
  const report={id,database,workId:result.work.id,preparedAt:new Date().toISOString(),modelRequests:0,...result};
  writeFileSync(resolve(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
  writeFileSync('practice.json',JSON.stringify({id,database,workId:result.work.id,preparedFrom:directory},null,2)+'\n');
  console.log(JSON.stringify({id,database,workId:result.work.id,directory,counts:Object.fromEntries(tables.map(name=>[name,result.fiveTables[name].length])),modelRequests:0}));
}
