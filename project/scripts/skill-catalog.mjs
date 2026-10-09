import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {skillRuntime} from './skill-runtime.mjs';

const {values}=parseArgs({options:{out:{type:'string',default:'runs/skill-catalog'},'check-tools':{type:'boolean',default:false}}});
const root=process.cwd(),out=resolve(values.out);
await mkdir(out,{recursive:true});
const sdkRequire=createRequire(import.meta.resolve('@openai/codex-sdk'));
const entry=sdkRequire.resolve('@openai/codex/bin/codex.js');
const {runtime}=await skillRuntime(root,resolve(out,'catalog-workbench.sqlite'));
const overrides=[...runtime.configOverrides,'plugins.novel-practice@novel-agent-lab.enabled=false'];
const child=spawn(process.execPath,[entry,...overrides.flatMap(value=>['-c',value]),'app-server','--stdio'],{cwd:root,stdio:['pipe','pipe','pipe'],windowsHide:true});
const transcript=[],errors=[];
const pending=new Map();
let nextId=0;
const lines=createInterface({input:child.stdout});
lines.on('line',line=>{
  const message=JSON.parse(line);transcript.push({direction:'received',message});
  const waiting=pending.get(message.id);
  if(waiting){pending.delete(message.id);message.error?waiting.reject(new Error(JSON.stringify(message.error))):waiting.resolve(message.result);}
});
child.stderr.on('data',chunk=>errors.push(chunk.toString()));
child.on('error',error=>{for(const waiting of pending.values())waiting.reject(error);pending.clear();});
child.on('exit',code=>{for(const waiting of pending.values())waiting.reject(new Error(`宿主在响应前退出：${code}`));pending.clear();});
const send=message=>{transcript.push({direction:'sent',message});child.stdin.write(JSON.stringify(message)+'\n');};
const request=(method,params)=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});send({id,method,params});});
let catalog=null,toolCatalog=null,threadId=null,error=null;
// 这里只读取公开目录，不创建会话或向模型发送任务。
const timeout=setTimeout(()=>{for(const waiting of pending.values())waiting.reject(new Error('读取目录超过 30 秒。'));pending.clear();child.kill();},30000);
try{
  await request('initialize',{clientInfo:{name:'skill_course_catalog',title:'课程 Skill 目录观察',version:'1.0.0'}});
  send({method:'initialized',params:{}});
  catalog=await request('skills/list',{cwds:[root],forceReload:true});
  if(values['check-tools']){
    const started=await request('thread/start',{cwd:root,sandbox:'read-only',approvalPolicy:'never'});
    threadId=started.thread.id;
    toolCatalog=await request('mcpServerStatus/list',{threadId,detail:'toolsAndAuthOnly'});
    await request('thread/archive',{threadId});
  }
}catch(cause){error=cause instanceof Error?cause.message:String(cause);}
finally{clearTimeout(timeout);child.stdin.end();await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));lines.close();}
await writeFile(resolve(out,'protocol.json'),JSON.stringify(transcript,null,2));
await writeFile(resolve(out,'stderr.txt'),errors.join(''));
await writeFile(resolve(out,'catalog.json'),JSON.stringify({root,catalog,error},null,2));
await writeFile(resolve(out,'runtime-tools.json'),JSON.stringify({root,runtime,threadId,toolCatalog,error},null,2));
const inventory=toolCatalog?.data??[];
const overridesForNextRun=[...new Set([...runtime.configOverrides.slice(1),...inventory.filter(item=>item.name!=='novel_lab').map(item=>item.pluginId?`plugins.${item.pluginId}.enabled=false`:`mcp_servers.${item.name}={command=${JSON.stringify(process.execPath)},args=[],enabled=false}`)])];
if(toolCatalog){
  await mkdir(resolve(root,'runs'),{recursive:true});
  await writeFile(resolve(root,'runs/skill-isolation.json'),JSON.stringify({origin:'本机公开 MCP 状态目录，仅用于后续实验进程；没有更改用户配置。',overrides:overridesForNextRun},null,2));
}
const own=catalog?.data?.find(item=>resolve(item.cwd)===root)?.skills?.find(item=>item.name==='novel-chapter-review');
const toolSummary=inventory.map(item=>({name:item.name,status:item.runtimeStatus,pluginId:item.pluginId,tools:Object.keys(item.tools??{})}));
const isolated=inventory.length>0&&inventory.filter(item=>Object.keys(item.tools??{}).length).every(item=>item.name==='novel_lab')&&Object.keys(inventory.find(item=>item.name==='novel_lab')?.tools??{}).sort().join(',')==='list_chapters,read_chapter,read_work';
if(toolCatalog)await writeFile(resolve(root,'runs/skill-preflight.json'),JSON.stringify({root,isolated,overrides:runtime.configOverrides.slice(1),nextOverrides:overridesForNextRun,toolSummary,transcriptPath:resolve(out,'protocol.json')},null,2));
console.log(JSON.stringify({out,ownSkill:own,toolSummary,isolated,error}));
if(error||!own?.enabled||own.scope!=='repo')process.exitCode=1;
