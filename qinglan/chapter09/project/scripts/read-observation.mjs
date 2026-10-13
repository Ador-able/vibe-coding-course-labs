import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {checkedTaskRuntime} from './task-runtime.mjs';

const {values}=parseArgs({options:{run:{type:'string'}}});
if(!values.run)throw new Error('请提供本次运行目录 --run。');
const run=resolve(values.run),report=JSON.parse(await readFile(resolve(run,'report.json'),'utf8'));
if(!report.threadId)throw new Error('该次运行没有返回主会话编号，请保留原失败记录。');
const out=resolve(run,'session-readback');await mkdir(out,{recursive:true});
const {runtime}=checkedTaskRuntime(),require=createRequire(import.meta.resolve('@openai/codex-sdk'));
const child=spawn(process.execPath,[require.resolve('@openai/codex/bin/codex.js'),...runtime.configOverrides.flatMap(value=>['-c',value]),'app-server','--stdio'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
const pending=new Map(),stderr=[];let nextId=0;const lines=createInterface({input:child.stdout});
lines.on('line',line=>{const message=JSON.parse(line),waiting=pending.get(message.id);if(waiting){pending.delete(message.id);message.error?waiting.reject(new Error(JSON.stringify(message.error))):waiting.resolve(message.result);}});
child.stderr.on('data',bytes=>stderr.push(bytes.toString()));
child.on('exit',code=>{for(const waiting of pending.values())waiting.reject(new Error(`读取宿主退出：${code}`));pending.clear();});
const send=message=>child.stdin.write(JSON.stringify(message)+'\n');
const request=(method,params)=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});send({id,method,params});});
const timer=setTimeout(()=>{for(const waiting of pending.values())waiting.reject(new Error('会话读取超过 30 秒。'));pending.clear();child.kill();},30000);
const reads=[];let error=null;
async function readThread(threadId,label){
  const metadata=await request('thread/read',{threadId,includeTurns:false});
  await writeFile(resolve(out,`${label}-metadata.json`),JSON.stringify(metadata,null,2));
  const entries=[];let cursor=null,page=0;
  do{
    const result=await request('thread/items/list',{threadId,limit:100,sortDirection:'asc',...(cursor?{cursor}:{})});
    await writeFile(resolve(out,`${label}-items-${page++}.json`),JSON.stringify(result,null,2));
    entries.push(...result.data);cursor=result.nextCursor;
  }while(cursor);
  const messages=entries.filter(x=>x.item.type==='agentMessage').map(x=>({phase:x.item.phase,text:x.item.text}));
  await writeFile(resolve(out,`${label}-messages.json`),JSON.stringify(messages,null,2));
  const finals=messages.filter(message=>message.phase==='final_answer');
  if(finals.length)await writeFile(resolve(out,`${label}-完整最终回答.txt`),finals.map(message=>message.text).join('\n\n'));
  reads.push({label,threadId,pages:page,items:entries.length,explicitFinalMessages:finals.length,types:[...new Set(entries.map(x=>x.item.type))]});
  return entries;
}
try{
  await request('initialize',{clientInfo:{name:'delegation_course_readback',version:'1.0.0'}});send({method:'initialized',params:{}});
  const parent=await readThread(report.threadId,'主会话');
  // 只追溯本次主会话实际返回的子编号，不猜测或扫描其他会话。
  const ids=[...new Set(parent.flatMap(({item})=>item.type==='collabAgentToolCall'?item.receiverThreadIds:item.type==='subAgentActivity'?[item.agentThreadId]:[]))].filter(id=>id!==report.threadId);
  for(let i=0;i<ids.length;i++)await readThread(ids[i],`子会话-${i+1}`);
}catch(cause){error=cause.message;}
finally{clearTimeout(timer);child.stdin.end();await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));lines.close();}
await writeFile(resolve(out,'stderr.txt'),stderr.join(''));
await writeFile(resolve(out,'report.json'),JSON.stringify({reads,error,modelTasks:0,limits:'原样保存官方应用接口返回的完整可见条目；未返回或不可见的输入、工具与用量仍是证据缺口，不根据密文相同推断明文。'},null,2));
console.log(JSON.stringify({out,reads,error,modelTasks:0}));if(error)process.exitCode=1;
