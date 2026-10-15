import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Store} from '../store.js';
import {workInput,LabError} from '../schemas.js';

test('三章按真实前文修订推进，改稿令旧引用失效，导出保留准确状态与正文',async()=>{
  const store=new Store(':memory:');
  try{
    const three=workInput.parse(JSON.parse(await readFile('seed/凡人修仙传.json','utf8')));
    const first={...three,outline:three.outline.slice(0,1)};
    store.init(first);
    const base={workId:first.id,chapterNumber:1,expectedWorkRevision:1,expectedChapterRevision:0,expectedPreviousRevisions:[],title:'测试第一章',body:'人工测试初稿。'};
    store.saveDraft(base,'agent');
    store.updateWork(three,1);
    assert.deepEqual(store.getWorkVersion(first.id,1).outline,first.outline);
    assert.equal(store.getWorkVersion(first.id,2).outline.length,3);
    assert.throws(()=>store.saveDraft({...base,expectedChapterRevision:1},'agent'),error=>error instanceof LabError&&error.code==='STALE_WORK');
    store.saveDraft({...base,expectedWorkRevision:2,expectedChapterRevision:1,body:'人工入口改稿示范。'},'human');
    const adopted=store.adopt(first.id,1,2,'测试采用入口，不代表真实读者品质判断。');
    assert.equal(adopted.revision,3);
    assert.equal(adopted.status,'adopted');
    const second={...base,chapterNumber:2,expectedWorkRevision:2,title:'测试第二章',body:'接续人工改稿的测试正文。',expectedPreviousRevisions:[{number:1,revision:2}]};
    assert.throws(()=>store.saveDraft(second,'agent'),error=>error instanceof LabError&&error.code==='STALE_PREVIOUS');
    const third={...second,chapterNumber:3,title:'测试第三章',body:'第三章测试正文。',expectedPreviousRevisions:[{number:1,revision:3},{number:2,revision:1}]};
    assert.throws(()=>store.saveDraft(third,'agent'),error=>error instanceof LabError&&error.code==='PREVIOUS_CHAPTER_MISSING');
    store.saveDraft({...second,expectedPreviousRevisions:[{number:1,revision:3}]},'agent');
    assert.equal(store.exportWork(first.id).allOutlineChaptersSaved,false);
    store.saveDraft(third,'agent');
    const exported=store.exportWork(first.id);
    assert.equal(exported.allOutlineChaptersSaved,true);
    assert.deepEqual(exported.chapters.map(chapter=>[chapter.number,chapter.revision,chapter.status]),[[1,3,'adopted'],[2,1,'draft'],[3,1,'draft']]);
    assert.equal(exported.chapters.every(chapter=>chapter.basisCurrent),true);
    assert.equal(exported.chapters[0].reviewNote,adopted.reviewNote);
    assert.ok(exported.text.includes(`采用说明：${adopted.reviewNote}`));
    for(const body of ['人工入口改稿示范。',second.body,third.body])assert.ok(exported.text.includes(body));
    store.saveDraft({...base,expectedWorkRevision:2,expectedChapterRevision:3,body:'后来再次修改第一章。'},'human');
    assert.equal(store.exportWork(first.id).chapters[1].basisCurrent,false);
    assert.equal(store.exportWork(first.id).chapters[2].basisCurrent,false);
  }finally{store.close();}
});
