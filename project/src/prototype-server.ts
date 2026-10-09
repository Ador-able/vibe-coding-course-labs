import {parseArgs} from 'node:util';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {Store} from './store.js';
import {prototypeServer} from './prototype-http.js';
import {workId} from './schemas.js';
const {values}=parseArgs({options:{db:{type:'string'},port:{type:'string',default:'4337'},work:{type:'string'}}});
if(!values.db||!values.work)throw new Error('启动需要明确的 --db 与 --work；请先通过 CLI 初始化作品资料。');
const database=resolve(values.db),id=workId.parse(values.work),port=Number(values.port);
if(!existsSync(database))throw new Error('数据库尚不存在；请先通过 CLI 初始化作品资料。');
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('端口须为 1 至 65535 的整数。');
const store=new Store(database);
store.getWork(id);
const server=prototypeServer(store,id);
// 网页与 MCP 共用业务 Store，不导入正文或另存页面副本。
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({url:'http://127.0.0.1:'+port,db:database,workId:id,mode:'共享 Store；人工查看与修改已保存草稿'})));
process.once('SIGINT',()=>server.close(()=>{store.close();process.exit(0);}));
process.once('SIGTERM',()=>server.close(()=>{store.close();process.exit(0);}));
