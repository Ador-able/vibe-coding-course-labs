import {createInterface} from 'node:readline';
import {once} from 'node:events';

// 这是课堂构造的 stdin 门槛；服务入口尚未载入，等待也不是人的采用决定。
console.log(JSON.stringify({
  state:'waiting-for-stdin-before-service',
  pid:process.pid,
  cwd:process.cwd(),
  lessonRun:process.env.LESSON_RUN_ID??null,
  serviceLoaded:false,
}));
const input=createInterface({input:process.stdin});
const [line]=await once(input,'line');
input.close();
if(line!=='start')throw new Error('本教学门槛只接受 start；没有启动服务。');
await import('../dist/prototype-server.js');
