import {readFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Store} from '../dist/store.js';
import {workInput,draftInput} from '../dist/schemas.js';

export async function readMaterials(){
  const work=workInput.parse(JSON.parse(await readFile(new URL('../materials/作品.json',import.meta.url),'utf8')));
  const chapters=[];
  for(const [index,name] of ['第一章.md','第二章.md','第三章.md'].entries()){
    const markdown=(await readFile(new URL('../materials/'+name,import.meta.url),'utf8')).replaceAll('\r\n','\n');
    const separator=markdown.indexOf('\n\n');
    chapters.push({number:index+1,title:markdown.slice(0,separator).replace(/^# /,''),body:markdown.slice(separator+2).trimEnd()});
  }
  return {work,chapters};
}

export async function seedPrototype(db,id='fanren'){
  const archive=await readMaterials();
  const store=new Store(db);
  try{
    const work=store.init(workInput.parse({...archive.work,id}));
    const chapters=[];
    // 每个独立库只导入完整正文，不继承旧修订、采用或任务记录。
    for(const source of archive.chapters){chapters.push(store.saveDraft(draftInput.parse({workId:id,chapterNumber:source.number,expectedWorkRevision:work.revision,expectedChapterRevision:0,expectedPreviousRevisions:chapters.map(c=>({number:c.number,revision:c.revision})),title:source.title,body:source.body}),'human'));}
    return {work,chapters,scope:'完整凡人原文片段人工导入；资料 r1、三章 r1/draft，没有模型生成或继承采用。'};
  }finally{store.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const {values}=parseArgs({options:{db:{type:'string',default:'data/fanren/prototype.sqlite'},id:{type:'string',default:'fanren'}}});console.log(JSON.stringify(await seedPrototype(resolve(values.db),values.id)));}
