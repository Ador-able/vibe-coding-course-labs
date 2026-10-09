import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {Store} from '../store.js';
import {prototypeServer} from '../prototype-http.js';

test('零章经人工保存成为可读取草稿，旧基线不能覆盖',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'h07-http-'));
  const store=new Store(join(directory,'human-test.sqlite'));
  const workId='human-http-test';
  store.init({id:workId,title:'人工输入测试',purpose:'核对 HTTP 与 Store 的共同读写。',requirements:['保留完整人工测试文字。'],facts:['这段文字是测试输入，不是模型小说。'],outline:[{number:1,titleHint:'测试章',goal:'保存人工文字。'}]});
  const server=prototypeServer(store,workId);
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const address=server.address();assert.ok(address&&typeof address==='object');
  const base=`http://127.0.0.1:${address.port}`;
  const body='这是隔离数据库中的人工测试文字。\n用于核对首次保存及旧修订拒绝，不是课堂模型生成结果。';
  const input={workId,chapterNumber:1,expectedWorkRevision:1,expectedChapterRevision:0,expectedPreviousRevisions:[],title:'人工测试章',body};
  try{
    const empty=await fetch(`${base}/api/work?work=${workId}`).then(response=>response.json());
    assert.deepEqual(empty.chapters,[]);
    const response=await fetch(`${base}/api/draft`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
    assert.equal(response.status,200);
    const saved=await response.json();
    assert.equal(saved.revision,1);assert.equal(saved.origin,'human');assert.equal(saved.status,'draft');
    const readBack=await fetch(`${base}/api/work?work=${workId}`).then(response=>response.json());
    assert.equal(readBack.chapters[0].title,input.title);assert.equal(readBack.chapters[0].body,body);
    assert.equal(store.getChapter(workId,1)?.body,body);
    const stale=await fetch(`${base}/api/draft`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...input,body:'这份旧基线不应覆盖当前正文。'})});
    assert.equal(stale.status,409);assert.equal((await stale.json()).error.code,'STALE_CHAPTER');
    assert.equal(store.getChapter(workId,1)?.body,body);
  }finally{
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    store.close();
    await rm(directory,{recursive:true});
  }
});
