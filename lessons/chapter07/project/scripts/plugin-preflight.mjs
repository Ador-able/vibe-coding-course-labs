import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {pluginRuntime} from './plugin-runtime.mjs';

const {values}=parseArgs({options:{out:{type:'string'},'read-only':{type:'boolean',default:false}}});
const root=process.cwd(),out=resolve(values.out??(values['read-only']?'runs/plugin-readonly-preflight':'runs/plugin-preflight'));
await mkdir(out,{recursive:true});
const {runtime,settings}=await pluginRuntime(root,{readOnly:values['read-only']});
const require=createRequire(import.meta.resolve('@openai/codex-sdk'));
const entry=require.resolve('@openai/codex/bin/codex.js');
const child=spawn(process.execPath,[entry,...runtime.configOverrides.flatMap(value=>['-c',value]),'app-server','--stdio'],{cwd:root,stdio:['pipe','pipe','pipe'],windowsHide:true});
const transcript=[],errors=[],pending=new Map();
let nextId=0,threadId=null,catalog=null,status=null,configuration=null,error=null;
const lines=createInterface({input:child.stdout});
lines.on('line',line=>{const message=JSON.parse(line);const waiting=pending.get(message.id);const recorded=waiting?.method==='config/read'&&message.result?{...message,result:{config:Object.fromEntries(['memories','features','skills','project_doc_max_bytes','developer_instructions','projects','windows'].map(key=>[key,message.result.config[key]])),limits:'只记录本实验涉及的配置；其他用户配置未收录。'}}:message;transcript.push({direction:'received',message:recorded});if(waiting){pending.delete(message.id);message.error?waiting.reject(new Error(JSON.stringify(message.error))):waiting.resolve(message.result);}});
child.stderr.on('data',chunk=>errors.push(chunk.toString()));
child.on('exit',code=>{for(const waiting of pending.values())waiting.reject(new Error(`目录宿主退出：${code}`));pending.clear();});
const send=message=>{transcript.push({direction:'sent',message});child.stdin.write(JSON.stringify(message)+'\n');};
const request=(method,params)=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{method,resolve,reject});send({id,method,params});});
// 仅检查官方宿主公开目录，不发送模型任务或执行业务工具。
const timer=setTimeout(()=>{for(const waiting of pending.values())waiting.reject(new Error('目录读取超过 30 秒。'));pending.clear();child.kill();},30000);
try{
  await request('initialize',{clientInfo:{name:'plugin_course_preflight',version:'1.0.0'}});
  send({method:'initialized',params:{}});
  const resolved=await request('config/read',{cwd:root,includeLayers:false});
  configuration=Object.fromEntries(['memories','features','skills','project_doc_max_bytes','developer_instructions','projects','windows'].map(key=>[key,resolved.config[key]]));
  catalog=await request('skills/list',{cwds:[root],forceReload:true});
  const started=await request('thread/start',{cwd:root,sandbox:'read-only',approvalPolicy:'never'});
  threadId=started.thread.id;
  status=await request('mcpServerStatus/list',{threadId,detail:'toolsAndAuthOnly'});
  await request('thread/archive',{threadId});
}catch(cause){error=cause instanceof Error?cause.message:String(cause);}
finally{clearTimeout(timer);child.stdin.end();await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));lines.close();}
await writeFile(resolve(out,'protocol.json'),JSON.stringify(transcript,null,2));
await writeFile(resolve(out,'stderr.txt'),errors.join(''));
await writeFile(resolve(out,'catalog.json'),JSON.stringify(catalog,null,2));
await writeFile(resolve(out,'mcp-status.json'),JSON.stringify(status,null,2));
await writeFile(resolve(out,'configuration.json'),JSON.stringify(configuration,null,2));
const inventory=status?.data??[];
// 延续前次真实目录确认的停用项；停用后不再列出的插件也需保持本轮覆盖。
const previousDisables=runtime.configOverrides.filter(value=>/^plugins\..+\.enabled=false$/.test(value)||/^mcp_servers\.[^=]+=\{.*enabled=false\}$/.test(value));
const nextOverrides=[...new Set([...previousDisables,...inventory.filter(item=>item.pluginId!==settings.pluginId).map(item=>item.pluginId?`plugins.${item.pluginId}.enabled=false`:`mcp_servers.${item.name}={command=${JSON.stringify(process.execPath)},args=[],enabled=false}`)])];
const own=inventory.find(item=>item.pluginId===settings.pluginId&&item.name===settings.serverName);
const expected=[...settings.enabledTools].sort().join(',');
const toolSummary=inventory.map(item=>({name:item.name,status:item.runtimeStatus,pluginId:item.pluginId,tools:Object.keys(item.tools??{})}));
const isolated=!!own&&Object.keys(own.tools??{}).sort().join(',')===expected&&inventory.filter(item=>Object.keys(item.tools??{}).length).every(item=>item.pluginId===settings.pluginId);
const skills=catalog?.data?.find(item=>resolve(item.cwd)===root)?.skills?.filter(item=>item.pluginId===settings.pluginId&&item.enabled)??[];
const allSkills=catalog?.data?.find(item=>resolve(item.cwd)===root)?.skills??[];
const enabledSkills=allSkills.filter(item=>item.enabled);
const skillsIsolated=enabledSkills.length===2&&enabledSkills.every(item=>item.pluginId===settings.pluginId);
const memoryIsolated=configuration?.memories?.use_memories===false&&configuration?.memories?.generate_memories===false&&configuration?.project_doc_max_bytes===0&&!configuration?.developer_instructions;
// 同名插件目录正确，仍可能装载旧数据库绑定；模型运行前比较实际缓存文件。
let bindingMatches=false,bindingCheckError=null;
try{
  const expectedBinding=JSON.parse(await readFile(resolve(root,'plugins/novel-workbench-course/binding.json'),'utf8'));
  const installedRoot=skills.length?resolve(skills[0].path,'../../..'):null;
  const installedBinding=installedRoot?JSON.parse(await readFile(resolve(installedRoot,'binding.json'),'utf8')):null;
  bindingMatches=!!installedBinding&&resolve(installedBinding.entry)===resolve(expectedBinding.entry)&&resolve(installedBinding.database)===resolve(expectedBinding.database);
}catch(cause){bindingCheckError=cause.message;}
const report={root,runtime,threadId,isolated,skillsIsolated,memoryIsolated,bindingMatches,bindingCheckError,configuration,skills,enabledSkillNames:enabledSkills.map(item=>item.name),toolSummary,error,limits:'仅目录与实际插件绑定检查，没有向模型发送任务或执行业务工具。'};
await mkdir(resolve(root,'runs'),{recursive:true});
await writeFile(resolve(root,'runs/plugin-isolation.json'),JSON.stringify({overrides:nextOverrides},null,2));
await writeFile(resolve(root,'runs/skill-isolation.json'),JSON.stringify({entries:allSkills.filter(item=>item.pluginId!==settings.pluginId).map(item=>({path:item.path,enabled:false}))},null,2));
await writeFile(resolve(root,values['read-only']?'runs/plugin-readonly-preflight.json':'runs/plugin-preflight.json'),JSON.stringify(report,null,2));
await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({out,isolated,skillsIsolated,memoryIsolated,bindingMatches,bindingCheckError,skills,toolSummary,error}));
if(error)process.exitCode=1;
