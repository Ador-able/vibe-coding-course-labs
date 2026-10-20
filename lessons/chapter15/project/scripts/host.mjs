import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {appendFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {officialEntry} from './codex-local.mjs';
import {codexEnvironment} from './codex-environment.mjs';

export function configurationProjection(value){
  const config=value.config;
  return {model:config.model,review_model:config.review_model,features:config.features,memories:config.memories,web_search:config.web_search,project_doc_max_bytes:config.project_doc_max_bytes,sandbox_mode:config.sandbox_mode,approval_policy:config.approval_policy,developerInstructionsPresent:!!config.developer_instructions,mcpEntries:Object.entries(config.mcp_servers??{}).map(([name,item])=>({name,enabled:item.enabled})),pluginEntries:Object.entries(config.plugins??{}).map(([name,item])=>({name,enabled:item.enabled}))};
}
function publicMessage(message,method){
  if(message.method?.startsWith('account/'))return {...message,params:{omitted:'账户通知与课堂业务无关，私密字段不公开。'}};
  if(method==='config/read'&&message.result)return {...message,result:configurationProjection(message.result)};
  return message;
}
// 仅传递固定版本原生RPC，不安排模型工具步骤、不自动批准或重试。
export function host({cwd,out,settings,docBudget=32768,readOnly=true,onNotification=()=>{},onFailure=()=>{}}){
  const overrides=[`model=${JSON.stringify(settings.model)}`,'features.apps=false','features.shell_tool=true','features.hooks=false','features.memories=false','memories.use_memories=false','memories.generate_memories=false','skills.bundled.enabled=false','web_search="disabled"','developer_instructions=""',`project_doc_max_bytes=${docBudget}`,`sandbox_mode="${readOnly?'read-only':'workspace-write'}"`,'approval_policy="never"'];
  const child=spawn(process.execPath,[officialEntry,...overrides.flatMap(value=>['-c',value]),'app-server','--stdio'],{cwd,env:codexEnvironment(),stdio:['pipe','pipe','pipe'],windowsHide:true});
  const pending=new Map(),notifications=[],protocol=[],stderr=[];let id=0,closing=false,writes=Promise.resolve();
  const closed=new Promise(done=>child.once('close',(code,signal)=>done({code,signal})));
  const fail=error=>{for(const waiting of pending.values()){clearTimeout(waiting.timer);waiting.reject(error);}pending.clear();if(!closing)onFailure(error);};
  const record=(direction,message)=>{const entry={at:new Date().toISOString(),direction,message};protocol.push(entry);writes=writes.then(()=>appendFile(resolve(out,'protocol.jsonl'),JSON.stringify(entry)+'\n'));writes.catch(onFailure);};
  const send=message=>{record('sent',message);child.stdin.write(JSON.stringify(message)+'\n');};
  const request=(method,params)=>new Promise((done,reject)=>{const requestId=++id,timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('原生请求超时：'+method+'，未重试。'));},45000);pending.set(requestId,{method,timer,done,reject});send({id:requestId,method,params});});
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{
    let message;try{message=JSON.parse(line);}catch(error){fail(error);return;}
    const waiting=pending.get(message.id),projected=publicMessage(message,waiting?.method);record('received',projected);
    if(waiting){pending.delete(message.id);clearTimeout(waiting.timer);message.error?waiting.reject(Object.assign(new Error(JSON.stringify(message.error)),{rpcError:true})):waiting.done(message.result);return;}
    if(message.method){notifications.push(projected);onNotification(projected);}
    if(message.id!==undefined)send({id:message.id,error:{code:-32601,message:'本实验观察器不执行交互批准。'}});
  });
  child.stderr.on('data',chunk=>stderr.push(chunk.toString()));child.stdin.on('error',fail);child.on('error',fail);child.on('exit',code=>fail(new Error('原生宿主退出：'+code)));
  return {child,overrides,request,send,protocol,notifications,
    async close(){closing=true;if(child.exitCode===null&&!child.stdin.destroyed)child.stdin.end();const timer=setTimeout(()=>child.kill(),10000);const result=await closed;clearTimeout(timer);lines.close();await writes;await writeFile(resolve(out,'stderr.txt'),stderr.join(''));return result;}
  };
}
