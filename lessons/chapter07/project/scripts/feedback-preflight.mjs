import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import {feedbackRuntime,configurationProjection} from './feedback-runtime.mjs';

const {values}=parseArgs({options:{out:{type:'string',default:'runs/feedback-preflight-01'},'directory-only':{type:'boolean',default:false},trusted:{type:'boolean',default:false}}});
const root=process.cwd(),out=resolve(values.out);
await mkdir(out,{recursive:true});
const {runtime,settings}=await feedbackRuntime(root,{executeHooks:values.trusted,directoryHooks:values['directory-only']});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const configFile=resolve(process.env.USERPROFILE,'.codex/config.toml'),globalBefore=sha(await readFile(configFile));
const require=createRequire(import.meta.resolve('@openai/codex-sdk'));
const entry=require.resolve('@openai/codex/bin/codex.js');
const child=spawn(process.execPath,[entry,...runtime.configOverrides.flatMap(value=>['-c',value]),'app-server','--stdio'],{cwd:root,stdio:['pipe','pipe','pipe'],windowsHide:true});
const protocol=[],stderr=[],pending=new Map();
let nextId=0,threadId=null,skills=null,hooks=null,status=null,configuration=null,error=null,archived=false;
const lines=createInterface({input:child.stdout});
lines.on('line',line=>{
 const message=JSON.parse(line),waiting=pending.get(message.id);
 const recorded=waiting?.method==='config/read'&&message.result?{...message,result:configurationProjection(message.result,root)}:message;
 protocol.push({direction:'received',message:recorded});
 if(waiting){pending.delete(message.id);message.error?waiting.reject(new Error(JSON.stringify(message.error))):waiting.resolve(message.result);}
});
child.stderr.on('data',chunk=>stderr.push(chunk.toString()));
const fail=cause=>{for(const waiting of pending.values())waiting.reject(cause);pending.clear();};
child.stdin.on('error',fail);
child.on('exit',code=>fail(new Error(`纯目录宿主退出：${code}`)));
child.on('error',fail);
const send=message=>{protocol.push({direction:'sent',message});child.stdin.write(JSON.stringify(message)+'\n');};
const request=(method,params)=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{method,resolve,reject});send({id,method,params});});
const timer=setTimeout(()=>{fail(new Error('纯目录读取超过45秒，未发送模型任务。'));child.kill();},45000);
try{
 await request('initialize',{clientInfo:{name:'feedback_course_preflight',version:'1.0.0'},capabilities:{experimentalApi:true}});
 send({method:'initialized',params:{}});
 configuration=configurationProjection(await request('config/read',{cwd:root,includeLayers:false}),root);
 hooks=await request('hooks/list',{cwds:[root]});
 skills=await request('skills/list',{cwds:[root],forceReload:true});
 if(!values['directory-only']){
  const started=await request('thread/start',{cwd:root,model:settings.model,sandbox:'read-only',approvalPolicy:'never'});
  threadId=started.thread.id;
  status=await request('mcpServerStatus/list',{threadId,detail:'toolsAndAuthOnly'});
 }
}catch(cause){error=cause instanceof Error?cause.message:String(cause);}
finally{
 if(threadId){try{await request('thread/archive',{threadId});archived=true;}catch(cause){error??=`空会话归档失败：${cause.message}`;}}
 clearTimeout(timer);child.stdin.end();
 const killing=setTimeout(()=>child.kill(),10000);
 await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));
 clearTimeout(killing);lines.close();
}
const inventory=status?.data??[],own=inventory.find(item=>!item.pluginId&&item.name===settings.serverName);
const expected=settings.enabledTools.slice().sort().join(',');
const mcpIsolated=!!own&&Object.keys(own.tools??{}).sort().join(',')===expected&&inventory.filter(item=>Object.keys(item.tools??{}).length).every(item=>!item.pluginId&&item.name===settings.serverName);
const catalog=skills?.data?.find(item=>resolve(item.cwd)===root),allSkills=catalog?.skills??[];
const enabledSkills=allSkills.filter(item=>item.enabled),ownSkillPath=resolve(root,settings.skillPath);
const skillsIsolated=enabledSkills.length===1&&enabledSkills[0].name===settings.skillName&&resolve(enabledSkills[0].path)===ownSkillPath;
const memoryIsolated=configuration?.memories?.use_memories===false&&configuration?.memories?.generate_memories===false&&configuration?.project_doc_max_bytes===0&&!configuration?.developerInstructionsPresent;
const hookEntries=hooks?.data?.find(item=>resolve(item.cwd)===root);
const hookDefinitionSingle=!!hookEntries&&!hookEntries.errors?.length&&hookEntries.hooks.length===1&&hookEntries.hooks[0].source==='project';
// 停用项只依据实际目录生成，并延续此前已发现的覆盖，不修改全局配置。
if(!error){
 const previous=runtime.configOverrides.filter(value=>/^plugins\..+\.enabled=false$/.test(value)||/^mcp_servers\.[^=]+=\{.*enabled=false\}$/.test(value));
 const next=[...new Set([...previous,...inventory.filter(item=>item.pluginId||item.name!==settings.serverName).map(item=>item.pluginId?`plugins.${item.pluginId}.enabled=false`:`mcp_servers.${item.name}={command=${JSON.stringify(process.execPath)},args=[],enabled=false}`)])];
 await writeFile(resolve(root,'runs/feedback-isolation.json'),JSON.stringify({overrides:next},null,2));
 await writeFile(resolve(root,'runs/feedback-skill-isolation.json'),JSON.stringify({entries:allSkills.filter(item=>resolve(item.path)!==ownSkillPath).map(item=>({path:item.path,enabled:false}))},null,2));
}
const globalAfter=sha(await readFile(configFile));
const modelCalls=protocol.filter(item=>item.direction==='sent'&&item.message.method==='turn/start').length;
const hookCalls=protocol.filter(item=>item.direction==='received'&&item.message.method==='hook/started').length;
const businessToolCalls=protocol.filter(item=>item.direction==='received'&&item.message.method==='item/started'&&item.message.params?.item?.type==='mcpToolCall').length;
const report={out,root,threadId,archived,directoryOnly:values['directory-only'],trusted:values.trusted,modelCalls,hookCalls,businessToolCalls,configuration,mcpIsolated:values['directory-only']?null:mcpIsolated,skillsIsolated,memoryIsolated,hookDefinitionSingle,hooksExecutionEnabled:configuration?.features?.hooks===true,enabledSkills:enabledSkills.map(item=>({name:item.name,path:item.path})),toolSummary:inventory.map(item=>({name:item.name,pluginId:item.pluginId,status:item.runtimeStatus,tools:Object.keys(item.tools??{})})),globalConfigHashBefore:globalBefore,globalConfigHashAfter:globalAfter,globalConfigUnchanged:globalBefore===globalAfter,error,limits:'只取得官方目录和配置、建立并归档空会话；不发送turn/start，不调用业务工具，不手工执行Hook。目录发现不证明方法已读取或任务已完成。'};
for(const [name,value]of Object.entries({protocol,skills,hooks,'mcp-status':status,configuration,runtime,report}))await writeFile(resolve(out,name+'.json'),JSON.stringify(value,null,2));
await writeFile(resolve(out,'stderr.txt'),stderr.join(''));
console.log(JSON.stringify({out,mcpIsolated:report.mcpIsolated,skillsIsolated,memoryIsolated,hookDefinitionSingle,modelCalls:0,error}));
if(error)process.exitCode=1;
