import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {pluginRuntime} from './plugin-runtime.mjs';

export async function archivePluginSession(root,threadId,out){
  const {runtime}=await pluginRuntime(root);
  const require=createRequire(import.meta.resolve('@openai/codex-sdk'));
  const entry=require.resolve('@openai/codex/bin/codex.js');
  const child=spawn(process.execPath,[entry,...runtime.configOverrides.flatMap(value=>['-c',value]),'app-server','--stdio'],{cwd:root,stdio:['pipe','pipe','pipe'],windowsHide:true});
  const transcript=[],stderr=[],pending=new Map();let id=0,error=null,archived=false;
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{const message=JSON.parse(line);transcript.push({direction:'received',message});const item=pending.get(message.id);if(item){pending.delete(message.id);message.error?item.reject(new Error(JSON.stringify(message.error))):item.resolve(message.result);}});
  child.stderr.on('data',chunk=>stderr.push(chunk.toString()));
  child.on('exit',code=>{for(const item of pending.values())item.reject(new Error(`归档宿主退出：${code}`));pending.clear();});
  const send=message=>{transcript.push({direction:'sent',message});child.stdin.write(JSON.stringify(message)+'\n');};
  const request=(method,params)=>new Promise((resolve,reject)=>{const requestId=++id;pending.set(requestId,{resolve,reject});send({id:requestId,method,params});});
  const timer=setTimeout(()=>{for(const item of pending.values())item.reject(new Error('归档超过 30 秒。'));pending.clear();child.kill();},30000);
  try{
    await request('initialize',{clientInfo:{name:'plugin_course_archive',version:'1.0.0'}});
    send({method:'initialized',params:{}});
    // 仅归档传入的自有会话；不发送模型任务，也不操作业务数据。
    await request('thread/archive',{threadId});archived=true;
  }catch(cause){error=cause instanceof Error?cause.message:String(cause);}
  finally{clearTimeout(timer);child.stdin.end();await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));lines.close();}
  const result={threadId,archived,error,transcript,stderr:stderr.join('')};
  await mkdir(out,{recursive:true});await writeFile(resolve(out,'archive.json'),JSON.stringify(result,null,2));
  return result;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [threadId,out]=process.argv.slice(2);
  if(!threadId||!out)throw new Error('需要自有会话标识与记录目录。');
  const result=await archivePluginSession(process.cwd(),threadId,resolve(out));
  console.log(JSON.stringify({threadId,archived:result.archived,error:result.error}));
  if(result.error)process.exitCode=1;
}
