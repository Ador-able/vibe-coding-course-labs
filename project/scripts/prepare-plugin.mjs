import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {access,readFile,writeFile} from 'node:fs/promises';
import {Store} from '../dist/store.js';
import {approvedExcerpt} from '../dist/schemas.js';

const {values}=parseArgs({options:{db:{type:'string',default:'data/novel.sqlite'},task:{type:'string'},excerpt:{type:'string'}}});
const entry=resolve('dist/mcp.js'),database=resolve(values.db);
await access(entry);
await access(database);
const store=new Store(database);
const taskId=values.task??null,excerptPath=values.excerpt?resolve(values.excerpt):null;
try{
  if(!store.listWorks().length)throw new Error('数据库还没有初始化作品。');
  const task=taskId?store.getTask(taskId):null;
  if(excerptPath){
    if(!task)throw new Error('局部修改需要已绑定的章节任务。');
    const scope=approvedExcerpt.parse(JSON.parse(await readFile(excerptPath,'utf8')));
    if(task.workId!==scope.workId||task.chapterNumber!==scope.chapterNumber)throw new Error('人工选区与已绑定任务的对象不一致。');
  }
}finally{store.close();}
const binding={entry,database,taskId,excerptPath};
await writeFile('plugins/novel-workbench-course/binding.json',JSON.stringify(binding,null,2),'utf8');
console.log(JSON.stringify({binding,limits:'仅绑定当前本地构建与数据库；安装缓存刷新、宿主加载和实际调用仍需分别检查。'}));
