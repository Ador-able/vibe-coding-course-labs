import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {hookRuntime} from './hook-runtime.mjs';

const {values}=parseArgs({options:{out:{type:'string',default:'runs/hook-preflight-01'},'directory-only':{type:'boolean',default:false}}});
const root=process.cwd(),out=resolve(values.out);
await mkdir(out,{recursive:true});
const {runtime,settings}=await hookRuntime(root);
// hooks/list 需要开启功能；此分支只读目录，不启动会话，避免 SessionStart。
const directoryOnly=values['directory-only'];
const overrides=[...runtime.configOverrides,`features.hooks=${directoryOnly}`];
const require=createRequire(import.meta.resolve('@openai/codex-sdk'));
const entry=require.resolve('@openai/codex/bin/codex.js');
const child=spawn(process.execPath,[entry,...overrides.flatMap(value=>['-c',value]),'app-server','--stdio'],{cwd:root,stdio:['pipe','pipe','pipe'],windowsHide:true});
const transcript=[],errors=[],pending=new Map();
let nextId=0,threadId=null,catalog=null,status=null,hooks=null,configuration=null,error=null;
const lines=createInterface({input:child.stdout});
lines.on('line',line=>{
 const message=JSON.parse(line),waiting=pending.get(message.id);
 const recorded=waiting?.method==='config/read'&&message.result?{...message,result:{config:Object.fromEntries(['memories','features','skills','project_doc_max_bytes','developer_instructions'].map(key=>[key,message.result.config[key]])),projectTrust:Object.entries(message.result.config.projects??{}).filter(([key])=>resolve(key).toLowerCase()===root.toLowerCase()),layers:(message.result.layers??[]).map(layer=>({name:layer.name,disabledReason:layer.disabledReason,configKeys:Object.keys(layer.config??{})})),limits:'仅收录本章涉及的配置及层的来源；其他配置正文未收录。'}}:message;
 transcript.push({direction:'received',message:recorded});
 if(waiting){pending.delete(message.id);message.error?waiting.reject(new Error(JSON.stringify(message.error))):waiting.resolve(message.result);}
});
child.stderr.on('data',chunk=>errors.push(chunk.toString()));
child.on('exit',code=>{for(const waiting of pending.values())waiting.reject(new Error(`目录宿主退出：${code}`));pending.clear();});
const send=message=>{transcript.push({direction:'sent',message});child.stdin.write(JSON.stringify(message)+'\n');};
const request=(method,params)=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{method,resolve,reject});send({id,method,params});});
const timer=setTimeout(()=>{for(const waiting of pending.values())waiting.reject(new Error('纯目录读取超过 45 秒。'));pending.clear();child.kill();},45000);
try{
 await request('initialize',{clientInfo:{name:'hook_course_preflight',version:'1.0.0'},capabilities:{experimentalApi:true}});
 send({method:'initialized',params:{}});
 const configured=await request('config/read',{cwd:root,includeLayers:true});
 configuration=Object.fromEntries(['memories','features','skills','project_doc_max_bytes','developer_instructions'].map(key=>[key,configured.config[key]]));
 configuration.projectTrust=Object.entries(configured.config.projects??{}).filter(([key])=>resolve(key).toLowerCase()===root.toLowerCase());
 configuration.layers=(configured.layers??[]).map(layer=>({name:layer.name,disabledReason:layer.disabledReason,configKeys:Object.keys(layer.config??{})}));
 hooks=await request('hooks/list',{cwds:[root]});
 catalog=await request('skills/list',{cwds:[root],forceReload:true});
 if(!directoryOnly){
  const started=await request('thread/start',{cwd:root,sandbox:'read-only',approvalPolicy:'never'});
  threadId=started.thread.id;
  status=await request('mcpServerStatus/list',{threadId,detail:'toolsAndAuthOnly'});
  await request('thread/archive',{threadId});
 }
}catch(cause){error=cause instanceof Error?cause.message:String(cause);}
finally{
 clearTimeout(timer);child.stdin.end();
 await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));
 lines.close();
}
const inventory=status?.data??[];
const previousDisables=runtime.configOverrides.filter(value=>/^plugins\..+\.enabled=false$/.test(value)||/^mcp_servers\.[^=]+=\{.*enabled=false\}$/.test(value));
const nextOverrides=[...new Set([...previousDisables,...inventory.filter(item=>item.pluginId||item.name!==settings.serverName).map(item=>item.pluginId?`plugins.${item.pluginId}.enabled=false`:`mcp_servers.${item.name}={command=${JSON.stringify(process.execPath)},args=[],enabled=false}`)])];
const allSkills=catalog?.data?.find(item=>resolve(item.cwd)===root)?.skills??[];
const enabledSkills=allSkills.filter(item=>item.enabled);
const own=inventory.find(item=>!item.pluginId&&item.name===settings.serverName);
const expected=[...settings.enabledTools].sort().join(',');
const isolated=!!own&&Object.keys(own.tools??{}).sort().join(',')===expected&&inventory.filter(item=>Object.keys(item.tools??{}).length).every(item=>!item.pluginId&&item.name===settings.serverName);
const skillsIsolated=enabledSkills.length===0;
const memoryIsolated=configuration?.memories?.use_memories===false&&configuration?.memories?.generate_memories===false&&configuration?.project_doc_max_bytes===0&&!configuration?.developer_instructions;
const report={root,overrides,threadId,directoryOnly,isolated:directoryOnly?null:isolated,skillsIsolated,memoryIsolated,hooksExecutionDisabled:configuration?.features?.hooks===false,ownServer:own??null,enabledSkillNames:enabledSkills.map(item=>item.name),toolSummary:inventory.map(item=>({name:item.name,status:item.runtimeStatus,pluginId:item.pluginId,tools:Object.keys(item.tools??{})})),error,limits:directoryOnly?'只读 Hooks/Skills/配置目录，未启动会话、未发送 turn/start、未执行 Hook 或业务工具。':'仅官方宿主公开目录与配置，没有发送 turn/start 或执行业务工具；完整私人目录证据不直接作为公开下载材料。'};
for(const [name,value]of Object.entries({protocol:transcript,hooks,catalog,'mcp-status':status,configuration,report}))await writeFile(resolve(out,name+'.json'),JSON.stringify(value,null,2));
await writeFile(resolve(out,'stderr.txt'),errors.join(''));
if(!directoryOnly&&!error)await writeFile(resolve(root,'runs/plugin-isolation.json'),JSON.stringify({overrides:nextOverrides},null,2));
if(!error)await writeFile(resolve(root,'runs/skill-isolation.json'),JSON.stringify({entries:allSkills.filter(item=>item.pluginId!==settings.pluginId).map(item=>({path:item.path,enabled:false}))},null,2));
console.log(JSON.stringify({out,directoryOnly,isolated:report.isolated,skillsIsolated,memoryIsolated,hooksExecutionDisabled:report.hooksExecutionDisabled,ownServerPresent:!!own,hookCounts:hooks?.data?.map(item=>({cwd:item.cwd,count:item.hooks.length,errors:item.errors,warnings:item.warnings})),toolSummary:report.toolSummary,error}));
if(error)process.exitCode=1;
