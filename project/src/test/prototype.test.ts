import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {Store,type Chapter} from '../store.js';
import {workInput,draftInput} from '../schemas.js';
import {prototypeServer} from '../prototype-http.js';

test('两个 HTTP 编辑者不能用旧修订覆盖已保存正文，重读与 CLI/Store 一致',async()=>{
  const archive=JSON.parse(readFileSync('fixtures/three-chapter-archive.json','utf8'));
  const store=new Store(join(mkdtempSync(join(tmpdir(),'novel-prototype-')),'fixture.sqlite'));
  const id='prototype-'+randomUUID();const work=store.init(workInput.parse({...archive.work,id}));
  const chapters:Chapter[]=[];for(const c of archive.chapters){chapters.push(store.saveDraft(draftInput.parse({workId:id,chapterNumber:c.number,expectedWorkRevision:work.revision,expectedChapterRevision:0,expectedPreviousRevisions:chapters.map(p=>({number:p.number,revision:p.revision})),title:c.title,body:c.body}),'human'));}
  const server=prototypeServer(store,id);server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert(address&&typeof address!=='string');const base='http://127.0.0.1:'+address.port;
  try{
    const before=await(await fetch(base+'/api/work?work='+id)).json();assert.deepEqual(before.chapters.map((c:{body:string})=>c.body),archive.chapters.map((c:{body:string})=>c.body));
    const input={workId:id,chapterNumber:2,expectedWorkRevision:1,expectedChapterRevision:1,expectedPreviousRevisions:[{number:1,revision:1}],title:chapters[1].title,body:chapters[1].body+'\n\n人工修改：林澈停下来再听一次。'};
    const a=await fetch(base+'/api/draft',{method:'POST',body:JSON.stringify(input)});assert.equal(a.status,200);const saved=await a.json();assert.equal(saved.revision,2);assert.equal(saved.origin,'human');assert.equal(saved.taskId,null);
    const b=await fetch(base+'/api/draft',{method:'POST',body:JSON.stringify({...input,body:'旧窗口的修改不能覆盖'})});assert.equal(b.status,409);assert.equal((await b.json()).error.code,'STALE_CHAPTER');
    const after=await(await fetch(base+'/api/work?work='+id)).json();assert.equal(after.chapters[1].body,input.body);assert.equal(after.chapters[1].revision,2);assert.equal(after.chapters[2].basisCurrent,false);assert.deepEqual(store.getChapter(id,2),saved);
    const invalid=await fetch(base+'/api/draft',{method:'POST',body:JSON.stringify({...input,body:''})});assert.equal(invalid.status,400);assert.equal((await invalid.json()).error.code,'INVALID_INPUT');
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));store.close();}
});
