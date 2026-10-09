import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {Store} from '../dist/store.js';
import {workInput,draftInput} from '../dist/schemas.js';

export async function seedPrototype(db,id='prototype-'+randomUUID()){
  const archive=JSON.parse(await readFile(new URL('../fixtures/three-chapter-archive.json',import.meta.url),'utf8'));
  const store=new Store(db);
  try{
    const {revision,...original}=archive.work;const work=store.init(workInput.parse({...original,id}));
    const chapters=[];
    for(const source of archive.chapters){chapters.push(store.saveDraft(draftInput.parse({workId:id,chapterNumber:source.number,expectedWorkRevision:work.revision,expectedChapterRevision:0,expectedPreviousRevisions:chapters.map(c=>({number:c.number,revision:c.revision})),title:source.title,body:source.body}),'human'));}
    return {work,chapters,scope:'通过 Store 人工初始化；完整正文来自既有归档，当前 r1/draft 不是历史运行修订或模型新生成。'};
  }finally{store.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1'))){const {values}=parseArgs({options:{db:{type:'string',default:'data/prototype.sqlite'},id:{type:'string'}}});console.log(JSON.stringify(await seedPrototype(resolve(values.db),values.id)));}
