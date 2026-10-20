import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {taskRuntime} from './task-runtime.mjs';
import {getCodeVersion} from './version.mjs';

const root=process.cwd(),out=resolve('runs/host-preflight'),{runtime,options}=taskRuntime();
await mkdir(out,{recursive:true});
const require=createRequire(import.meta.resolve('@openai/codex-sdk'));
const child=spawn(process.execPath,[require.resolve('@openai/codex/bin/codex.js'),...runtime.configOverrides.flatMap(value=>['-c',value]),'app-server','--stdio'],{cwd:root,stdio:['pipe','pipe','pipe'],windowsHide:true});
const pending=new Map(),errors=[];
let nextId=0,configuration=null,skills=null,servers=null,threadId=null,modelCapability=null,threadConfiguration=null,error=null;
const lines=createInterface({input:child.stdout});
lines.on('line',line=>{const message=JSON.parse(line),waiting=pending.get(message.id);if(waiting){pending.delete(message.id);message.error?waiting.reject(new Error(JSON.stringify(message.error))):waiting.resolve(message.result);}});
child.stderr.on('data',bytes=>errors.push(bytes.toString()));
child.on('exit',code=>{for(const waiting of pending.values())waiting.reject(new Error(`检查宿主退出：${code}`));pending.clear();});
const send=message=>child.stdin.write(JSON.stringify(message)+'\n');
const request=(method,params)=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});send({id,method,params});});
const timer=setTimeout(()=>{for(const waiting of pending.values())waiting.reject(new Error('宿主检查超过 30 秒。'));pending.clear();child.kill();},30000);
try{
  await request('initialize',{clientInfo:{name:'delegation_course_preflight',version:'1.0.0'}});send({method:'initialized',params:{}});
  const resolved=await request('config/read',{cwd:root,includeLayers:false});
  // 只留实验相关配置，不收录账户、服务地址或其他用户配置。
  configuration=Object.fromEntries(['model','model_provider','model_reasoning_effort','agents','memories','features','skills','project_doc_max_bytes','developer_instructions','projects','windows'].map(key=>[key,resolved.config[key]]));
  skills=await request('skills/list',{cwds:[root],forceReload:true});
  const started=await request('thread/start',{cwd:root,sandbox:options.sandboxMode,approvalPolicy:'never'});threadId=started.thread.id;
  threadConfiguration={model:started.model,modelProvider:started.modelProvider,reasoningEffort:started.reasoningEffort,multiAgentMode:started.multiAgentMode,instructionSources:started.instructionSources,sandbox:started.sandbox,approvalPolicy:started.approvalPolicy};
  const models=await request('model/list',{includeHidden:true});
  const selected=models.data.find(item=>item.model===started.model);
  modelCapability=selected?{model:selected.model,multiAgentVersion:selected.multiAgentVersion}:null;
  servers=await request('mcpServerStatus/list',{threadId,detail:'toolsAndAuthOnly'});
  await request('thread/archive',{threadId});
}catch(cause){error=cause.message;}
finally{clearTimeout(timer);child.stdin.end();await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));lines.close();}
const enabledSkills=(skills?.data?.find(item=>resolve(item.cwd)===root)?.skills??[]).filter(item=>item.enabled).map(item=>({name:item.name,path:item.path}));
const toolSummary=(servers?.data??[]).map(item=>({name:item.name,tools:Object.keys(item.tools??{})}));
const memoryIsolated=configuration?.memories?.use_memories===false&&configuration?.memories?.generate_memories===false&&configuration?.project_doc_max_bytes===0&&!configuration?.developer_instructions;
const subagentConfigured=configuration?.agents?.enabled===true&&Boolean(modelCapability?.multiAgentVersion);
const ready=!error&&memoryIsolated&&subagentConfigured&&enabledSkills.length===0&&toolSummary.every(item=>item.tools.length===0);
const report={codeVersion:getCodeVersion(),root,runtime,options,configuration,threadConfiguration,modelCapability,subagentConfigured,enabledSkills,toolSummary,threadId,ready,error,modelTasks:0,limits:'只读取官方宿主配置、模型目录和工具目录并关闭空会话。模型目录声明多代理能力，不证明实际创建或返回成功；未向模型发送任务。'};
await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));await writeFile(resolve(out,'stderr.txt'),errors.join(''));
console.log(JSON.stringify({out,ready,memoryIsolated,subagentConfigured,modelCapability,enabledSkills,toolSummary:toolSummary.map(item=>({name:item.name,count:item.tools.length})),error,modelTasks:0}));if(!ready)process.exitCode=1;
