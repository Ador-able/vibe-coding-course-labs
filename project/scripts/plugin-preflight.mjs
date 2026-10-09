import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createReadStream} from 'node:fs';
import {readFile,writeFile,mkdir,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {isDeepStrictEqual} from 'node:util';
import {parseArgs} from 'node:util';

const {values}=parseArgs({options:{definition:{type:'string'}}});
if(!values.definition)throw new Error('需要本次完整目录定义。');
const definitionPath=resolve(values.definition),definitionBytes=await readFile(definitionPath);
const definition=JSON.parse(definitionBytes.toString('utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const root=process.cwd(),out=resolve(definition.out);
const review=JSON.parse(await readFile(definition.approval.reviewPath,'utf8'));
if(!review.approvedBy||review.definitionSha256!==hash(definitionBytes)||review.programSha256!==hash(await readFile(import.meta.filename)))throw new Error('本次完整定义与程序尚未获准。');
if(root!==definition.root)throw new Error('目录检查必须在本章独立 lab 执行。');
await mkdir(out,{recursive:true});
const summary=async path=>{
  // 共享配置只计算摘要，不解析正文、生成副本或写回旧字节。
  const digest=createHash('sha256');for await(const chunk of createReadStream(path))digest.update(chunk);
  const info=await stat(path);return {path,bytes:info.size,sha256:digest.digest('hex'),mtime:info.mtime.toISOString()};
};
const files=async directory=>{
  let entries;try{entries=await readdir(directory,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return [];throw error;}
  const found=[];
  for(const entry of entries){const path=join(directory,entry.name);if(entry.isDirectory())found.push(...await files(path));else if(entry.isFile()){const bytes=await readFile(path);found.push({path,bytes:bytes.length,sha256:hash(bytes)});}}
  return found.sort((a,b)=>a.path.localeCompare(b.path));
};
const snapshot=()=>{
  const db=new DatabaseSync(definition.database,{readOnly:true});
  try{return JSON.parse(JSON.stringify(Object.fromEntries(['works','work_versions','chapters','chapter_versions','tasks'].map(table=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()]))));}finally{db.close();}
};
await writeFile(resolve(out,'input.json'),JSON.stringify({definition,definitionSha256:hash(definitionBytes),programSha256:hash(await readFile(import.meta.filename)),review,nodeVersion:process.versions.node},null,2)+'\n');
const before={global:await summary(definition.sharedConfig.path),fiveTables:snapshot(),cache:await files(definition.cache.baseRoot),host:await summary(definition.host.executable)};
await writeFile(resolve(out,'before.json'),JSON.stringify(before,null,2)+'\n');
if(before.global.bytes!==definition.sharedConfig.expected.bytes||before.global.sha256!==definition.sharedConfig.expected.sha256)throw new Error('共享配置摘要已变化，停止并交还主编，不恢复旧值。');
if(!isDeepStrictEqual(before.fiveTables,JSON.parse(await readFile(definition.expectedFiveTables,'utf8'))))throw new Error('当前完整五表与固定起点不符。');
if(!isDeepStrictEqual(before.cache,definition.cache.beforeFiles))throw new Error('目标缓存与只读定位时不同，停止，不删除或刷新以凑结果。');
if(before.host.bytes!==definition.fixedHostDependency.bytes||before.host.sha256!==definition.fixedHostDependency.sha256)throw new Error('实际官方宿主二进制与固定依赖不符。');
for(const item of definition.sources){const bytes=await readFile(item.path);if(bytes.length!==item.bytes||hash(bytes)!==item.sha256)throw new Error(`冻结原件不符：${item.path}`);}

const transcript=[],stderr=[],pending=new Map();let nextId=0,threadId=null,archived=false,archiveRequested=false,error=null;
let configuration=null,plugins=null,hooks=null,catalog=null,status=null,started=null,installedCache=null;
const child=spawn(definition.host.executable,definition.host.argv,{cwd:root,stdio:['pipe','pipe','pipe'],windowsHide:true});
const exit=new Promise(resolveExit=>{child.once('exit',(code,signal)=>resolveExit({pid:child.pid,exitCode:code,signal}));child.once('error',cause=>resolveExit({pid:child.pid??null,exitCode:null,signal:null,spawnError:cause.message}));});
const lines=createInterface({input:child.stdout});
const select=(object,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(object??{},key)).map(key=>[key,object[key]]));
const configSummary=config=>({
  memories:select(config.memories,['use_memories','generate_memories']),
  features:select(config.features,['memories','hooks','plugins']),
  skills:{bundled:config.skills?.bundled,config:config.skills?.config},
  project_doc_max_bytes:config.project_doc_max_bytes,
  hasDeveloperInstructions:!!config.developer_instructions,
  nativeProjectTrust:config.projects?.[definition.trustKey]?.trust_level??null,
  web_search:config.web_search,
});
const publicResponse=(method,result)=>{
  if(method==='config/read')return {config:configSummary(result.config),scope:'有效配置只取本次非秘密字段；不保存配置层、共享正文、规则正文或凭据。'};
  if(method==='plugin/list')return {marketplaces:(result.marketplaces??[]).map(item=>({name:item.name,path:item.path,plugins:(item.plugins??[]).map(plugin=>select(plugin,plugin.id===definition.settings.pluginId?['id','name','localVersion','source','installed','enabled']:['id','name','localVersion','installed','enabled']))})),marketplaceLoadErrors:result.marketplaceLoadErrors??[],scope:'自有源保留路径；其他项不保存远端源、共享身份、计划、账户、接口描述或凭据。'};
  if(method==='hooks/list')return {data:(result.data??[]).map(item=>({cwd:item.cwd,hooks:(item.hooks??[]).map(hook=>select(hook,['id','eventName','source','sourcePath','enabled','trustStatus','handlerType'])),warnings:item.warnings,errors:item.errors})),scope:'目录必须为空；不保存 Hook 命令、Prompt 或规则正文。'};
  if(method==='skills/list')return {data:(result.data??[]).map(item=>({cwd:item.cwd,skills:(item.skills??[]).map(skill=>select(skill,['name','path','scope','enabled','pluginId'])),errors:item.errors})),scope:'只保存名称、路径、启用与归属；两份自有方法原文另由固定源核对。'};
  if(method==='thread/start')return select(result,['thread','cwd','approvalPolicy','sandbox','model','reasoningEffort','serviceTier']);
  if(method==='mcpServerStatus/list')return {data:(result.data??[]).map(item=>item.pluginId===definition.settings.pluginId?item:{...select(item,['name','runtimeStatus','pluginId','authStatus']),toolNames:Object.keys(item.tools??{})}),nextCursor:result.nextCursor??null,scope:'自有工具保留完整定义；其他入口只保留身份、状态及工具名。'};
  return result;
};
lines.on('line',line=>{
  try{
    const message=JSON.parse(line),waiting=pending.get(message.id);
    const recorded=waiting&&message.result?{...message,result:publicResponse(waiting.method,message.result)}:
      message.method?.startsWith('remoteControl/')?{method:message.method,params:{omitted:'非本次教学所需的控制/安装身份，不保存其值。'}}:
      message.method==='hook/started'||message.method==='hook/completed'?{method:message.method,params:{threadId:message.params?.threadId,turnId:message.params?.turnId,run:select(message.params?.run,['id','eventName','handlerType','scope','sourcePath','source','status','startedAt','completedAt','durationMs'])}}:message;
    transcript.push({direction:'received',message:recorded});
    if(waiting){pending.delete(message.id);message.error?waiting.reject(new Error(JSON.stringify(message.error))):waiting.resolve(message.result);}
  }catch(cause){error={message:cause.message};for(const waiting of pending.values())waiting.reject(cause);pending.clear();}
});
child.stderr.on('data',chunk=>stderr.push(chunk));
child.stdin.on('error',cause=>{for(const waiting of pending.values())waiting.reject(cause);pending.clear();});
child.on('exit',(code,signal)=>{for(const waiting of pending.values())waiting.reject(new Error(`目录宿主退出：${code}/${signal}`));pending.clear();});
child.on('error',cause=>{for(const waiting of pending.values())waiting.reject(cause);pending.clear();});
const send=message=>{transcript.push({direction:'sent',message});child.stdin.write(JSON.stringify(message)+'\n');};
const request=(method,params)=>new Promise((resolveRequest,reject)=>{const id=++nextId;pending.set(id,{method,resolve:resolveRequest,reject});send({id,method,params});});
const timer=setTimeout(()=>{for(const waiting of pending.values())waiting.reject(new Error('目录检查超过本次 60 秒上限。'));pending.clear();child.kill();},60000);
const requireTrue=(condition,message)=>{if(!condition)throw new Error(message);};
try{
  await request('initialize',definition.protocol[0].params);send({method:'initialized',params:{}});
  const resolved=await request('config/read',{cwd:root,includeLayers:false});configuration=configSummary(resolved.config);
  requireTrue(configuration.nativeProjectTrust==='trusted'&&configuration.features.hooks===false&&configuration.features.plugins===true,'本进程原生信任或功能覆盖不符。');
  requireTrue(configuration.memories.use_memories===false&&configuration.memories.generate_memories===false&&configuration.features.memories===false&&configuration.project_doc_max_bytes===0&&!configuration.hasDeveloperInstructions&&configuration.skills.bundled?.enabled===false&&configuration.web_search==='disabled','规则/记忆/搜索的本次覆盖不符；全局用户规则仍不据此排除。');
  plugins=await request('plugin/list',{cwds:[root],marketplaceKinds:['local'],forceRefetch:false});
  requireTrue(!(plugins.marketplaceLoadErrors??[]).length,'本地 marketplace 有真实读取错误。');
  const ownMarketplace=plugins.marketplaces?.find(item=>item.name===definition.settings.marketplaceName);
  const ownPlugin=ownMarketplace?.plugins?.find(item=>item.id===definition.settings.pluginId);
  requireTrue(!!ownPlugin&&ownPlugin.installed&&ownPlugin.enabled&&ownPlugin.localVersion===definition.cache.version,'本次自有插件缓存尚未实际安装或版本不符。');
  installedCache=await files(definition.cache.versionRoot);
  requireTrue(isDeepStrictEqual(installedCache,definition.cache.expectedFiles),'实际缓存九原件与本章源、entry/database 绑定不符。');
  for(const item of definition.cache.expectedFiles){const destination=resolve(out,'installed-cache',item.path.slice(definition.cache.versionRoot.length+1));await mkdir(resolve(destination,'..'),{recursive:true});await writeFile(destination,await readFile(item.path));}
  hooks=await request('hooks/list',{cwds:[root]});
  requireTrue(hooks.data?.length===1&&hooks.data[0].cwd===root&&!(hooks.data[0].hooks??[]).length&&!(hooks.data[0].warnings??[]).length&&!(hooks.data[0].errors??[]).length,'Hook 目录不为空或不能完整对应本章，停止。');
  catalog=await request('skills/list',{cwds:[root],forceReload:true});
  const skillEntry=catalog.data?.find(item=>item.cwd===root),enabledSkills=(skillEntry?.skills??[]).filter(item=>item.enabled);
  requireTrue(skillEntry&&!(skillEntry.errors??[]).length&&enabledSkills.length===2&&enabledSkills.every(item=>item.pluginId===definition.settings.pluginId)&&isDeepStrictEqual(enabledSkills.map(item=>item.name).sort(),[...definition.skillNames].sort()),'两份实际启用方法或归属不符。');
  started=await request('thread/start',{cwd:root,sandbox:'read-only',approvalPolicy:'never'});threadId=started.thread.id;
  requireTrue(Array.isArray(started.thread.turns)&&started.thread.turns.length===0,'本次目录线程不是零轮。');
  status=await request('mcpServerStatus/list',{threadId,detail:'toolsAndAuthOnly'});
  const inventory=status.data??[],own=inventory.find(item=>item.pluginId===definition.settings.pluginId&&item.name===definition.settings.serverName);
  requireTrue(!status.nextCursor&&!!own&&isDeepStrictEqual(Object.keys(own.tools??{}).sort(),[...definition.settings.enabledTools].sort())&&inventory.filter(item=>Object.keys(item.tools??{}).length).every(item=>item.pluginId===definition.settings.pluginId),'实际业务工具、单页目录或归属不符。');
  archiveRequested=true;await request('thread/archive',{threadId});archived=true;
}catch(cause){error={message:cause.message,stack:cause.stack};}
finally{
  if(threadId&&!archiveRequested&&child.exitCode===null&&child.signalCode===null){try{archiveRequested=true;await request('thread/archive',{threadId});archived=true;}catch(cause){error={...(error??{}),archiveError:cause.message};}}
  clearTimeout(timer);child.stdin.end();
  const closeTimer=setTimeout(()=>child.kill(),10000);await exit;clearTimeout(closeTimer);lines.close();
}
await writeFile(resolve(out,'protocol.json'),JSON.stringify(transcript,null,2)+'\n');
await writeFile(resolve(out,'stderr.txt'),Buffer.concat(stderr));
const exitResult=await exit;let after=null;
try{after={global:await summary(definition.sharedConfig.path),fiveTables:snapshot(),cache:await files(definition.cache.baseRoot)};}catch(cause){error={...(error??{}),afterReadError:cause.message};}
const sent=transcript.filter(item=>item.direction==='sent'&&Object.hasOwn(item.message,'id'));
const forbidden=sent.filter(item=>['turn/start','review/start','command/exec','plugin/install','plugin/uninstall','config/value/write','config/batchWrite'].includes(item.message.method));
const hookRuns=transcript.filter(item=>item.message.method==='hook/started'||item.message.method==='hook/completed');
const executionEvents=transcript.filter(item=>['turn/started','review/started'].includes(item.message.method)||item.message.method==='item/started'&&['commandExecution','mcpToolCall'].includes(item.message.params?.item?.type));
const noChanges=!!after&&isDeepStrictEqual(after.fiveTables,before.fiveTables)&&after.global.bytes===before.global.bytes&&after.global.sha256===before.global.sha256;
const passed=!error&&archived&&exitResult.exitCode===0&&exitResult.signal===null&&!forbidden.length&&!hookRuns.length&&!executionEvents.length&&noChanges;
const report={passed,root,runtime:definition.runtime,threadOptions:definition.threadOptions,threadId,archived,exitResult,configuration,plugins:publicResponse('plugin/list',plugins??{}),hooks:publicResponse('hooks/list',hooks??{}),catalog:publicResponse('skills/list',catalog??{}),status:publicResponse('mcpServerStatus/list',status??{}),installedCache,counts:{requests:sent.length,turnStart:sent.filter(item=>item.message.method==='turn/start').length,commandExec:sent.filter(item=>item.message.method==='command/exec').length,hookRuns:hookRuns.length,executionEvents:executionEvents.length},fullFiveTablesUnchanged:!!after&&isDeepStrictEqual(after.fiveTables,before.fiveTables),sharedSummaryUnchanged:!!after&&after.global.bytes===before.global.bytes&&after.global.sha256===before.global.sha256,error,limits:['实际目录仅确认本次状态，仍未发送自然任务或调用业务工具。','project_doc_max_bytes=0不关闭全局用户规则；不读取其正文。','只核本连接实际 native PID 及归档/退出，不扩成所有子孙进程或全机检查。','缓存刷新与正常官方会话持久化可以写缓存/会话文件；本观察器不写回共享配置或恢复备份，实际摘要是否不变另列。','三个继承隔离标记仅在整体目录契约通过时放行；它们不表示全局用户规则已被隔离。']};
await writeFile(resolve(out,'after.json'),JSON.stringify(after,null,2)+'\n');
await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
await writeFile(resolve(root,'runs/plugin-preflight.json'),JSON.stringify({...report,isolated:passed,skillsIsolated:passed,memoryIsolated:passed},null,2)+'\n');
console.log(JSON.stringify({out,passed,threadId,archived,exitResult,error}));
if(!passed)process.exitCode=1;
