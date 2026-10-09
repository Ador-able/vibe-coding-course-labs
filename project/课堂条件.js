// 在已构建的课程实验根目录执行，只准备独立课堂条件。
import {readFileSync,existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const labRoot=process.cwd();
const {Store}=await import(pathToFileURL(resolve(labRoot,'dist/store.js')).href);
const base=JSON.parse(readFileSync(resolve(labRoot,'seed/钟楼.json'),'utf8'));
const seeds={A:base,B:{...base,
  requirements:[...base.requirements,'章末异常只能使用作者已选的方案。当前选择尚未提供；未确定前不要自行选案、合并两案或保存代表已确定方向的正文。'],
  facts:[...base.facts,'待作者选择的章末异常方案A：铜摆不动而影子有节律地摆动。方案B：铜摆与影子都不动，墙后以固定间隔传出细微齿轮声。这两案是备选方向，尚未成为故事事实。']},C:base};
const databases=Object.fromEntries(Object.keys(seeds).map(id=>[id,resolve(labRoot,`data/stop-${id}.sqlite`)]));
for(const db of Object.values(databases))if(existsSync(db))throw new Error('课堂库已存在，不覆盖：'+db);
mkdirSync(resolve(labRoot,'data'),{recursive:true});
for(const [id,seed] of Object.entries(seeds)){
  const store=new Store(databases[id]);
  try{
    store.init(seed);
    // 仅C库的章节写入实际报错，不影响其他库或任务记录。
    if(id==='C')store.db.exec("CREATE TRIGGER classroom_save_failure BEFORE INSERT ON chapters BEGIN SELECT RAISE(ABORT,'课堂写入故障：章节写入暂不可用；本轮条件保持不变。'); END;");
    const state={work:store.getWork('clocktower'),chapters:store.listChapters('clocktower'),chapter1:store.getChapter('clocktower',1)};
    writeFileSync(resolve(labRoot,`data/stop-${id}-材料与起点.json`),JSON.stringify(state,null,2),'utf8');
    console.log(JSON.stringify({case:id,db:databases[id],chapterCount:state.chapters.length}));
  }finally{store.close();}
}
