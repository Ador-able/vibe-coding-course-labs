import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {Store} from '../store.js';
import {workInput,LabError} from '../schemas.js';

test('真实保存可重开读取；人的修改令旧提议失效',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'agent-lab-state-'));
  const db=resolve(directory,'novel.sqlite');
  const seed=workInput.parse(JSON.parse(await readFile('seed/凡人修仙传.json','utf8')));
  const store=new Store(db);
  store.init(seed);
  const input={workId:seed.id,chapterNumber:1,expectedWorkRevision:1,expectedChapterRevision:0,expectedPreviousRevisions:[],title:'人工测试章节',body:'这段人工文字仅用于验证存储，不是模型生成。'};
  const first=store.saveDraft(input,'agent');
  assert.equal(first.status,'draft');
  store.close();
  const reopened=new Store(db);
  assert.equal(reopened.getChapter(seed.id,1)?.body,input.body);
  const edited=reopened.saveDraft({...input,expectedChapterRevision:1,body:'人修改后的有效正文。'},'human');
  assert.equal(edited.revision,2);
  assert.throws(()=>reopened.saveDraft({...input,expectedChapterRevision:1,body:'旧提议覆盖人的修改。'},'agent'),error=>error instanceof LabError&&error.code==='STALE_CHAPTER');
  assert.equal(reopened.getChapter(seed.id,1)?.body,'人修改后的有效正文。');
  assert.equal(reopened.db.prepare('SELECT COUNT(*) AS count FROM chapter_versions').get()?.count,2);
  reopened.close();
});
