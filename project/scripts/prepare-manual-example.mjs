import fs from 'node:fs/promises';
import path from 'node:path';
import {Store} from '../dist/store.js';

// 编者示范人工入口的输入；不冒称真实用户参与了文学采用。
const store=new Store(path.resolve('data/novel.sqlite'));
try{
 const work=store.getWork('clocktower');
 const chapter=store.getChapter(work.id,1);
 if(work.revision!==2||chapter?.revision!==1||chapter.status!=='draft')throw new Error('需要当前三章要求 r2 和原始第一章草稿 r1。');
 const original='一个穿旧棉袄的老人打开门上的小木窗';
 if(!chapter.body.includes(original))throw new Error('这份真实草稿不含示范修改位置，请阅读后自行设计改稿，不套用文本替换。');
 const body=chapter.body.replace(original,'守塔人周伯穿着旧棉袄，打开门上的小木窗')+'\n\n影子的尖端再次擦过那道砖缝时，墙后响起一记极轻的齿轮声。林澈听完一个来回，才转过头问周伯：“您也听见了吗？”';
 const proposal={workId:work.id,chapterNumber:1,expectedWorkRevision:work.revision,expectedChapterRevision:chapter.revision,expectedPreviousRevisions:[],title:chapter.title,body};
 await fs.writeFile('data/编者人工改稿示范.json',JSON.stringify(proposal,null,2));
 await fs.writeFile('data/改稿前实际正文.json',JSON.stringify(chapter,null,2));
 console.log(JSON.stringify({proposal:'data/编者人工改稿示范.json',workRevision:work.revision,chapterRevision:chapter.revision,limits:'编者演示人工入口，不是真实用户的阅读与采用决定。'}));
}finally{store.close();}
