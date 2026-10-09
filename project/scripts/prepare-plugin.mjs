import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {access,writeFile} from 'node:fs/promises';
import {Store} from '../dist/store.js';

const {values}=parseArgs({options:{db:{type:'string',default:'data/novel.sqlite'}}});
const entry=resolve('dist/mcp.js'),database=resolve(values.db);
await access(entry);
await access(database);
const store=new Store(database);
try{if(!store.listWorks().length)throw new Error('数据库还没有初始化作品。');}finally{store.close();}
const binding={entry,database};
await writeFile('plugins/novel-practice/binding.json',JSON.stringify(binding,null,2),'utf8');
console.log(JSON.stringify({binding,limits:'仅绑定当前本地构建与数据库；安装缓存刷新、宿主加载和实际调用仍需分别检查。'}));
