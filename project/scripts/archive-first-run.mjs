import fs from 'node:fs/promises';
import path from 'node:path';
import {Store} from '../dist/store.js';

const target='evidence/01-单章真实运行';
await fs.mkdir(target,{recursive:true});
const complete='50541e75-f1d2-46ca-952a-5cf4b29466c7';
const cancelled='419e0ada-1e8c-47ff-8c6a-2311448fc8c9';
for(const [id,label] of [[complete,'完整运行'],[cancelled,'实际取消']]){
  for(const file of ['input.json','events.jsonl','report.json','chapter.json','final-response.txt']){
    await fs.copyFile(path.join('runs',id,file),path.join(target,`${label}-${file}`));
  }
}
const store=new Store(path.resolve('data/novel.sqlite'));
try{
 const chapter=store.getChapter('clocktower',1);
 const completeTask=store.getTask(complete);
 const cancelledTask=store.getTask(cancelled);
 if(completeTask.state!=='completed'||cancelledTask.state!=='cancelled'||chapter?.taskId!==complete||chapter.revision!==1||chapter.status!=='draft')throw new Error('归档断言不符，不能沿用旧结论。');
 await fs.writeFile(path.join(target,'归档时真实状态.json'),JSON.stringify({work:store.getWork('clocktower'),chapters:store.listChapters('clocktower'),completeTask,cancelledTask,modelOutput:chapter,observed:'任务取消后，原先成功保存的 r1 草稿仍可从重开的 SQLite 读取；本轮取消没有新保存。',limits:'数量、修订与状态已经核对；文学品质由人判断，未人工采用。'},null,2));
 console.log(JSON.stringify({completeTaskId:complete,cancelledTaskId:cancelled,revision:chapter.revision,characters:chapter.body.length,archive:target}));
}finally{store.close();}
