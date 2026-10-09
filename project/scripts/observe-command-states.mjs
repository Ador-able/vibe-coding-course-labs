import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createInterface} from 'node:readline';
import {readFile,writeFile,appendFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync,backup} from 'node:sqlite';
import {isDeepStrictEqual,parseArgs} from 'node:util';
import {chromium} from '@playwright/test';
import {Store} from '../dist/store.js';

const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {values}=parseArgs({options:{mode:{type:'string'}}});
if(!['preflight','lesson'].includes(values.mode))throw new Error('请明确 --mode preflight 或 --mode lesson。');
const mode=values.mode,sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const definition=JSON.parse(await readFile(resolve(project,'config/command-states.json'),'utf8'));
// 固定定义只保存原课堂条件；本机命令路径在运行时解析。
for(const request of definition.requests)if(request.method==='command/exec'){
  request.params.cwd=project;
  if(/node(?:\.exe)?$/.test(request.params.command?.[0]??''))request.params.command[0]=process.execPath;
}
const database=resolve(project,definition.database),exportPath=resolve(project,definition.exportPath);
const tables=['works','work_versions','chapters','chapter_versions','tasks'];
const initial=JSON.parse(await readFile(resolve(project,'inputs/command-initial-five-tables.json'),'utf8'));
const git=(...args)=>execFileSync('git',['-C',project,...args],{encoding:'utf8'});
const head=git('rev-parse','HEAD').trim();
const review=JSON.parse(await readFile(resolve(project,'runs/command-'+mode+'-review.json'),'utf8'));
if(review.approvedBy!=='root'||review.implementationHead!==head||!review.definitionFiles?.length)throw new Error('本轮完整命令定义尚未由主编核读；未启动宿主。');
for(const item of review.definitionFiles){
  if(sha(await readFile(resolve(project,item.path)))!==item.sha256)throw new Error('核读后定义改变：'+item.path);
}
if(git('status','--porcelain=v1','--untracked-files=all'))throw new Error('固定工作树不干净；未启动宿主。');
const sourceRequire=createRequire(import.meta.resolve('@openai/codex-sdk'));
const officialWrapper=sourceRequire.resolve('@openai/codex/bin/codex.js');
for(const item of review.officialFiles??[]){
  if(sha(await readFile(item.path))!==item.sha256)throw new Error('固定官方入口改变：'+item.path);
}
if(officialWrapper!==review.officialWrapper)throw new Error('实际官方入口与已核定义不同。');
const version=execFileSync(process.execPath,[officialWrapper,'--version'],{encoding:'utf8'}).trim();
if(version!=='codex-cli 0.160.0')throw new Error('实际官方程序不是固定 0.160.0。');
const snapshot=path=>{
  const db=new DatabaseSync(path,{readOnly:true});
  try{return Object.fromEntries(tables.map(name=>[name,db.prepare(`SELECT * FROM ${name} ORDER BY 1,2`).all().map(row=>({...row}))]));}
  finally{db.close();}
};
if(!isDeepStrictEqual(snapshot(database),initial))throw new Error('正式起点五表与完整固定原件不同；不覆盖数据库。');
if(mode==='lesson'){
  const bytes=await readFile(resolve(review.preflightReport)),checked=JSON.parse(bytes.toString('utf8'));
  if(checked.mode!=='preflight'||checked.error||!checked.pipeAndTTYVerified||checked.implementationHead!==definition.completedPreflight.implementationHead||sha(bytes)!==definition.completedPreflight.reportSha256)throw new Error('已核的真实 pipe / PTY 前检原件不同；不启动长服务。');
  if(sha(await readFile(resolve(project,'scripts/inspect-command-condition.mjs')))!==definition.completedPreflight.programSha256)throw new Error('短程序已改变，不能沿用该实际前检。');
}
const out=resolve(project,'runs','command-'+mode+'-'+randomUUID());
await mkdir(out,{recursive:true});
const globalPath=resolve(process.env.USERPROFILE,'.codex/config.toml');
// 只取共享配置的 SHA，不复制、投影正文或写回外部配置。
const globalBefore=sha(await readFile(globalPath));
const protocol=[],observations=[],commands=[],helperCommands=[],outputs=new Map();
const runtime={officialWrapper,configOverrides:definition.hostOverrides,cwd:project};
let sequence=0,writes=Promise.resolve(),host=null,error=null,store=null,configuration=null;
const record=(kind,value)=>{
  const entry={sequence:++sequence,at:new Date().toISOString(),kind,...value};
  observations.push(entry);
  writes=writes.then(()=>appendFile(resolve(out,'observations.jsonl'),JSON.stringify(entry)+'\n'));
  writes.catch(()=>{});return entry;
};
const saveJSON=(name,value)=>writeFile(resolve(out,name+'.json'),JSON.stringify(value,null,2)+'\n');
const codeState=async()=>({head:git('rev-parse','HEAD').trim(),status:git('status','--porcelain=v1','--untracked-files=all'),files:await Promise.all(git('ls-files','-z').split('\0').filter(Boolean).map(async path=>({path,sha256:sha(await readFile(resolve(project,path)))})))});
const beforeCode=await codeState();
await saveJSON('input',{mode,definition,runtime,review,version,implementationHead:head});
await saveJSON('five-tables-before',snapshot(database));
const systemJSON=command=>{
  const argv=['-NoLogo','-NoProfile','-Command',command];let stdout='',stderr='',exitCode=0;
  try{stdout=execFileSync(definition.powerShell,argv,{cwd:project,encoding:'utf8',windowsHide:true,timeout:15000});}
  catch(cause){stdout=String(cause.stdout??'');stderr=String(cause.stderr??'');exitCode=cause.status??null;}
  helperCommands.push({at:new Date().toISOString(),command:[definition.powerShell,...argv],cwd:project,exitCode,stdout,stderr});
  if(exitCode!==0)throw new Error('本机只读进程检查失败，完整返回已保存。');
  return JSON.parse(stdout.trim()||'[]');
};
const listeners=ports=>systemJSON("$lessonRows=@(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object {$_.LocalPort -in @("+ports.join(',')+")} | Select-Object LocalAddress,LocalPort,OwningProcess); ConvertTo-Json -InputObject $lessonRows -Compress");
const processIdentity=pid=>systemJSON("$lessonRows=@(Get-CimInstance Win32_Process -Filter 'ProcessId = "+pid+"' -ErrorAction Stop | Select-Object ProcessId,ParentProcessId,CreationDate,ExecutablePath,CommandLine); ConvertTo-Json -InputObject $lessonRows -Compress");
const descendants=pid=>systemJSON("$lessonRows=@(Get-CimInstance Win32_Process -Filter 'ParentProcessId = "+pid+"' -ErrorAction Stop | Select-Object ProcessId,ParentProcessId,CreationDate,ExecutablePath,CommandLine); ConvertTo-Json -InputObject $lessonRows -Compress");
const ports=[53471,53472];

// 沿现有观察器的 stdio 方式连接官方入口；有限课堂动作不调度模型或自动批准。
function startHost(){
  const child=spawn(process.execPath,[officialWrapper,...runtime.configOverrides.flatMap(value=>['-c',value]),'app-server','--stdio'],{cwd:project,stdio:['pipe','pipe','pipe'],windowsHide:true});
  const pending=new Map(),stderr=[];let nextId=0,closed=false;
  const closedPromise=new Promise(done=>child.once('close',(code,signal)=>{closed=true;done({code,signal});}));
  const fail=cause=>{for(const item of pending.values()){clearTimeout(item.timer);item.reject(cause);}pending.clear();};
  const wire=(direction,message)=>{
    const entry={sequence:++sequence,at:new Date().toISOString(),direction,message};protocol.push(entry);
    writes=writes.then(()=>appendFile(resolve(out,'protocol.jsonl'),JSON.stringify(entry)+'\n'));writes.catch(()=>{});
  };
  const send=message=>{wire('sent',message);child.stdin.write(JSON.stringify(message)+'\n');};
  const begin=(method,params)=>{
    const call={id:++nextId,method,params,startedAt:new Date().toISOString(),startedMs:Date.now(),settled:false,result:null,error:null};
    call.promise=new Promise((done,reject)=>{
      const timeout=method==='command/exec'?(params.timeoutMs??30000)+30000:30000;
      const timer=setTimeout(()=>{pending.delete(call.id);reject(new Error('客户端等待超过记录期限：'+method+'；没有重试。'));},timeout);
      pending.set(call.id,{method,timer,resolve:done,reject});send({id:call.id,method,params});
    }).then(value=>{call.result=value;return value;}).catch(cause=>{call.error=cause.message;throw cause;}).finally(()=>{call.settled=true;call.endedAt=new Date().toISOString();});
    call.promise.catch(()=>{});return call;
  };
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{
    let message;try{message=JSON.parse(line);}catch(cause){fail(cause);return;}
    const waiting=pending.get(message.id);
    let shown=message;
    if(waiting?.method==='config/read'&&message.result)shown={...message,result:configurationProjection(message.result)};
    else if(message.method&&message.method!=='command/exec/outputDelta')shown={...message,params:{omitted:'本节不收录账户、指令或无关宿主通知正文'}};
    wire('received',shown);
    if(waiting){pending.delete(message.id);clearTimeout(waiting.timer);message.error?waiting.reject(new Error(JSON.stringify(message.error))):waiting.resolve(waiting.method==='config/read'?shown.result:message.result);return;}
    if(message.method==='command/exec/outputDelta'){
      const value=message.params,streams=outputs.get(value.processId)??{stdout:[],stderr:[],capReached:false};
      streams[value.stream].push(Buffer.from(value.deltaBase64,'base64'));streams.capReached||=value.capReached;outputs.set(value.processId,streams);
    }
    if(message.id!==undefined)send({id:message.id,error:{code:-32601,message:'本节观察器不自动批准交互请求。'}});
  });
  child.stderr.on('data',chunk=>stderr.push(Buffer.from(chunk)));
  child.stdin.on('error',fail);child.on('error',fail);child.on('exit',code=>fail(new Error('官方宿主退出：'+code)));
  return{child,begin,send,pending,
    async close(){
      if(!child.stdin.destroyed)child.stdin.end();
      const timer=setTimeout(()=>child.kill(),10000);const result=await closedPromise;clearTimeout(timer);lines.close();
      await writeFile(resolve(out,'host-stderr.txt'),Buffer.concat(stderr));return{...result,closed};
    },
  };
}
function configurationProjection(result){
  const c=result.config??result;
  return{approval_policy:c.approval_policy,features:{hooks:c.features?.hooks},memories:{use_memories:c.memories?.use_memories,generate_memories:c.memories?.generate_memories},web_search:c.web_search,project_doc_max_bytes:c.project_doc_max_bytes};
}
const requestByName=name=>{
  const item=definition.requests.find(item=>item.name===name);if(!item)throw new Error('缺少固定命令：'+name);return item;
};
const startCommand=name=>{
  const request=requestByName(name),call=host.begin(request.method,request.params);
  commands.push(call);record('command-started',{name,id:call.id,method:call.method,params:call.params});return call;
};
const output=call=>{
  const streams=outputs.get(call.params.processId)??{stdout:[],stderr:[],capReached:false};
  return{stdout:Buffer.concat(streams.stdout).toString('utf8')+(call.result?.stdout??''),stderr:Buffer.concat(streams.stderr).toString('utf8')+(call.result?.stderr??''),capReached:streams.capReached};
};
const completed=async call=>{
  const result=await call.promise,actual=output(call);
  record('command-final',{id:call.id,processId:call.params.processId,result,output:actual});
  if(actual.capReached)throw new Error('实际输出被底座截断，不能把它称为完整输出。');return result;
};
const waitFor=async(label,check,call=null)=>{
  const deadline=Date.now()+15000;let last=null;
  do{if(call?.settled)throw new Error(label+'前原 command/exec 已结束：'+JSON.stringify(call.result??call.error));
    last=await check();if(last)return last;await new Promise(done=>setTimeout(done,200));
  }while(Date.now()<deadline);
  throw new Error(label+'在 15 秒内未获确认；不重新执行命令。');
};
const HTTP=async(port,label)=>{
  const url='http://127.0.0.1:'+port+'/api/work?work='+encodeURIComponent(definition.workId);let result;
  try{const response=await fetch(url,{signal:AbortSignal.timeout(3000)}),text=await response.text();result={url,status:response.status,text,value:JSON.parse(text)};}
  catch(cause){result={url,error:cause.message};}
  record('http',{label,...result});
  if(result.status===200){
    const summary=store.exportWork(definition.workId),expected={work:store.getWork(definition.workId),chapters:store.listChapters(definition.workId).map(chapter=>({...store.getChapter(definition.workId,chapter.number),basisCurrent:summary.chapters.find(item=>item.number===chapter.number).basisCurrent}))};
    if(!isDeepStrictEqual(result.value,expected))throw new Error('实际 HTTP 完整对象与当前 Store 投影不同。');
    record('http-full-objects-matched',{label,url,resultSha256:sha(Buffer.from(result.text))});
  }
  return result;
};
const checkpoint=async label=>{
  const actual=snapshot(database);for(const table of definition.expectedPreservedTables)if(!isDeepStrictEqual(actual[table],initial[table]))throw new Error(label+'改变了应保留的 '+table+'。');
  for(const original of initial.tasks)if(!isDeepStrictEqual(actual.tasks.find(row=>row.id===original.id),original))throw new Error(label+'改变了原任务 '+original.id+'。');
  await saveJSON(label+'-five-tables',actual);
  const consistent=resolve(out,label+'-consistent.sqlite'),db=new DatabaseSync(database,{readOnly:true});
  try{await backup(db,consistent);}finally{db.close();}
  if(!isDeepStrictEqual(snapshot(consistent),actual))throw new Error('本轮一致备份与完整五表不同：'+label);
  record('checkpoint',{label,counts:Object.fromEntries(tables.map(table=>[table,actual[table].length])),backupPath:consistent,backupSha256:sha(await readFile(consistent))});
  return actual;
};
const task=(label,state,error=null)=>{
  const id=definition.ids[label];
  const value=state==='created'?store.createTask({id,workId:definition.workId,chapterNumber:definition.targetChapter,codeVersion:head}):store.updateTask(id,{state,error});
  record('task',{label,value});return value;
};
const pending=call=>host.pending.has(call.id)&&!call.settled;
const stop=async(call,name)=>{
  const elapsedMs=Date.now()-call.startedMs,wasPending=pending(call);
  record('before-stop',{name,originalId:call.id,processId:call.params.processId,originalPending:wasPending,elapsedMs,automaticTimeoutMs:call.params.timeoutMs});
  if(!wasPending)throw new Error('停止时原命令已经结束；不声称发生人工停止。');
  const item=requestByName(name),control=host.begin(item.method,item.params);
  const acknowledgement=await control.promise;record('stop-control-returned',{name,controlId:control.id,acknowledgement,originalSettledNow:call.settled});
  const result=await completed(call);
  if(Date.now()-call.startedMs>=call.params.timeoutMs)throw new Error('命令已到自动 timeoutMs 边界；只保留实际先后，不归因为人工停止。');
  record('stop-original-returned',{name,originalId:call.id,result});return result;
};
const condition=call=>{
  const clean=output(call).stdout.replace(/\u001b\[[0-9;?]*[A-Za-z]/g,'');
  const line=clean.split(/\r?\n/).find(line=>line.trim().startsWith('{'));return JSON.parse(line??'null');
};
const currentChapter=()=>JSON.parse(snapshot(database).chapters.find(row=>row.number===3).content);
const ui=async(port,label)=>{
  const dir=resolve(out,'ui');await mkdir(dir,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    for(const variant of ['original','desk','notes']){
      const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1});
      const url='http://127.0.0.1:'+port+'/?work='+encodeURIComponent(definition.workId)+'&chapter=3&variant='+variant;
      const responses=[];page.on('response',response=>{if(response.url().includes('/api/'))responses.push({url:response.url(),status:response.status()});});
      let navigationError=null;try{await page.goto(url,{waitUntil:'networkidle',timeout:10000});}catch(cause){navigationError=cause.message;}
      let value=null;
      if(!navigationError){
        await page.waitForFunction(()=>document.querySelector('#draft-body')?.value.length>0,null,{timeout:10000});
        value=await page.evaluate(()=>({variant:document.body.dataset.variant,title:document.querySelector('#draft-title').value,body:document.querySelector('#draft-body').value,revision:document.querySelector('#revision').textContent,message:document.querySelector('#message').textContent,saveDisabled:document.querySelector('#save').disabled,viewport:{width:innerWidth,height:innerHeight},devicePixelRatio}));
        const chapter=currentChapter();if(value.title!==chapter.title||value.body!==chapter.body||value.variant!==variant)throw new Error('页面与真实第 3 章或所选方案不同。');
      }
      const prefix=label+'-'+variant;await page.screenshot({path:resolve(dir,prefix+'.png'),fullPage:true});
      await saveJSON('ui/'+prefix,{url,responses,navigationError,value,scope:'整页截图和完整 textarea value；不是全部正文同时显示。失败页面是浏览器实际访问结果，不是小说应用的状态提示。'});
      record('ui',{label,variant,url,navigationError,bodySha256:value?sha(Buffer.from(value.body)):null});await page.close();
    }
  }finally{await browser.close();}
};
let pipeAndTTYVerified=false,A=null,B=null,identityA=null,identityB=null,hostIdentity=null,hostChildren=[],hostClosed=null;
try{
  const available=listeners(ports);record('ports-before',{listeners:available});
  if(available.length)throw new Error('本章固定端口已被占用；不改端口、不停止占用者。');
  await checkpoint('before');
  host=startHost();
  const init=host.begin(definition.initialization.method,definition.initialization.params);await init.promise;host.send({method:'initialized',params:{}});
  hostIdentity=processIdentity(host.child.pid);hostChildren=descendants(host.child.pid);record('official-host-identity',{identity:hostIdentity,children:hostChildren});
  configuration=await host.begin('config/read',{cwd:project,includeLayers:false}).promise;
  if(configuration.approval_policy!=='never'||configuration.features.hooks!==false||configuration.memories.use_memories!==false||configuration.memories.generate_memories!==false||configuration.web_search!=='disabled'||configuration.project_doc_max_bytes!==0)throw new Error('实际最小配置与已核输入不一致；不执行课堂命令。');
  await saveJSON('configuration-projection',configuration);
  if(mode==='preflight'){
    const pipe=startCommand('普通pipe条件');if((await completed(pipe)).exitCode!==0)throw new Error('pipe 短程序没有正常退出。');
    const pipeValue=condition(pipe);
    const tty=startCommand('同程序PTY条件');if((await completed(tty)).exitCode!==0)throw new Error('PTY 短程序没有正常退出。');
    const ttyValue=condition(tty);
    const cwdCorrect=value=>resolve(value.cwd).toLowerCase()===project.toLowerCase();
    if(!pipeValue||!ttyValue||!cwdCorrect(pipeValue)||!cwdCorrect(ttyValue)||pipeValue.lessonRun!==definition.ids.A||ttyValue.lessonRun!==definition.ids.A||pipeValue.stdinIsTTY||pipeValue.stdoutIsTTY||!ttyValue.stdinIsTTY||!ttyValue.stdoutIsTTY)throw new Error('实际管道与交互终端条件不符合固定的两种观察。');
    pipeAndTTYVerified=true;record('pipe-and-tty',{pipe:pipeValue,tty:ttyValue});
    if(!isDeepStrictEqual(snapshot(database),initial))throw new Error('短程序改变了起点五表。');
    await checkpoint('preflight-after');
  }else{
    store=new Store(database);
    task('A','created');task('A','running');
    // 只准备本次明确导出路径的父目录，业务导出仍交给既有 CLI。
    const created=await mkdir(dirname(exportPath),{recursive:true});
    record('export-directory-prepared',{path:dirname(exportPath),exportPath,newlyCreatedPath:created??null});
    const exported=startCommand('A当前三章实际导出');if((await completed(exported)).exitCode!==0)throw new Error('实际导出命令失败。');
    const expected=store.exportWork(definition.workId),fileBefore=await readFile(exportPath);
    if(!fileBefore.equals(Buffer.from(expected.text)))throw new Error('实际导出文件与完整 Store 导出不同。');
    await saveJSON('export-after-save',{result:expected,path:exportPath,bytes:fileBefore.length,sha256:sha(fileBefore)});
    if(store.getTask(definition.ids.A).state!=='running')throw new Error('持续阅读目标尚未结束，A 不应提前 completed。');
    await checkpoint('A-after-export');
    A=startCommand('A长服务');
    await waitFor('A 服务完整 HTTP',async()=>{const result=await HTTP(53471,'A-ready-probe');return result.status===200?result:null;},A);
    const listenerA=listeners([53471]);if(listenerA.length!==1)throw new Error('A 的实际监听者尚未唯一确认。');
    identityA=processIdentity(listenerA[0].OwningProcess);record('A-ready',{listeners:listenerA,identity:identityA,descendants:descendants(listenerA[0].OwningProcess),originalPending:pending(A),task:store.getTask(definition.ids.A)});
    task('B','created');task('B','running');B=startCommand('B独立对照长服务');
    await waitFor('B 服务完整 HTTP',async()=>{const result=await HTTP(53472,'B-ready-probe');return result.status===200?result:null;},B);
    const listenerB=listeners([53472]);if(listenerB.length!==1)throw new Error('B 的实际监听者尚未唯一确认。');
    identityB=processIdentity(listenerB[0].OwningProcess);record('B-ready',{listeners:listenerB,identity:identityB,descendants:descendants(listenerB[0].OwningProcess),originalPending:pending(B),task:store.getTask(definition.ids.B)});
    await ui(53471,'A-ready');
    task('failure','created');task('failure','running');
    const failure=startCommand('明确教师同端口失败反例'),failureResult=await completed(failure);
    if(failureResult.exitCode===0||!output(failure).stderr.includes('EADDRINUSE'))throw new Error('同端口反例没有得到预设的实际绑定失败；不另造或重试。');
    task('failure','failed','实际同端口绑定失败：'+output(failure).stderr);
    await HTTP(53471,'A-after-port-failure');await HTTP(53472,'B-after-port-failure');await checkpoint('failure-after');
    await stop(A,'停止A');
    const afterA={identity:processIdentity(identityA[0].ProcessId),listeners:listeners([53471]),BIdentity:processIdentity(identityB[0].ProcessId),BListeners:listeners([53472])};record('A-after-stop',afterA);
    if(afterA.identity.length||afterA.listeners.length||afterA.BIdentity.length!==1||afterA.BListeners.length!==1||!pending(B))throw new Error('停止 A 后实际进程或 B 对照状态未确认。');
    task('A','cancelled');
    const BCurrent=await HTTP(53472,'B-after-A-stop');if(BCurrent.status!==200)throw new Error('停止 A 后 B 不能正常读稿。');
    if(!(await readFile(exportPath)).equals(fileBefore))throw new Error('停止 A 改变了已保存导出文件。');
    await saveJSON('export-after-A-stop',{path:exportPath,bytes:fileBefore.length,sha256:sha(await readFile(exportPath)),sameAsSaved:true});
    await ui(53471,'A-stopped');await ui(53472,'B-after-A-stop');await checkpoint('A-after-stop');
    await stop(B,'最后停止本轮B');
    const afterB={identity:processIdentity(identityB[0].ProcessId),listeners:listeners([53472])};record('B-after-stop',afterB);
    if(afterB.identity.length||afterB.listeners.length)throw new Error('B 的实际 PID 或端口仍存在。');
    task('B','cancelled');
    await checkpoint('B-after-stop');
  }
}catch(cause){
  error=cause.message;record('error',{message:error});
  if(store)for(const label of ['A','B','failure']){
    const row=snapshot(database).tasks.find(row=>row.id===definition.ids[label]);
    if(row&&JSON.parse(row.content).state==='running'){
      const actual=commands.findLast(call=>call.params.env?.LESSON_RUN_ID===definition.ids[label]);
      const failed=actual?.settled&&(actual.error||actual.result?.exitCode!==0);
      task(label,failed?'failed':'interrupted',error);
    }
  }
}finally{
  // 异常清理也只对本连接已发起且仍待完成的确切过程，不按名称批量结束。
  if(host)for(const call of commands){
    if(call&&pending(call)){
      record('cleanup-stop-requested',{processId:call.params.processId,originalPending:true});
      try{await host.begin('command/exec/terminate',{processId:call.params.processId}).promise;await completed(call);}catch(cause){record('cleanup-stop-error',{processId:call.params.processId,error:cause.message});}
    }
  }
  store?.close();
  if(host)hostClosed=await host.close();
}
const after=snapshot(database),afterCode=await codeState(),globalAfter=sha(await readFile(globalPath));
try{
  const actual={listeners:listeners(ports),identities:[identityA,identityB,hostIdentity,hostChildren].filter(Boolean).flat().map(value=>({before:value,after:processIdentity(value.ProcessId)})),hostClosed};
  record('final-owned-process-check',actual);
  if(actual.listeners.length||actual.identities.some(item=>item.after.length))throw new Error('最终端口或已记录 PID 仍有对象；不宣称清理完成，不结束未知进程。');
  await checkpoint('final');
}catch(cause){error??=cause.message;record('final-check-error',{message:cause.message});}
const commandsPublic=commands.map(({promise,startedMs,...call})=>({...call,output:output(call)}));
const businessPreserved=definition.expectedPreservedTables.every(table=>isDeepStrictEqual(after[table],initial[table]));
const oldTasksPreserved=initial.tasks.every(original=>isDeepStrictEqual(after.tasks.find(row=>row.id===original.id),original));
const newTaskIds=after.tasks.filter(row=>!initial.tasks.some(original=>original.id===row.id)).map(row=>row.id);
const taskAdditionsWithinDefinition=newTaskIds.length<=definition.expectedTaskAdditionsMaximum&&newTaskIds.every(id=>['A','B','failure'].some(label=>definition.ids[label]===id));
const modelOrThreadStarts=protocol.filter(entry=>entry.direction==='sent'&&['thread/start','turn/start'].includes(entry.message.method)).length;
const report={out,mode,implementationHead:head,version,officialWrapper,error,pipeAndTTYVerified,commands:commandsPublic,modelOrThreadStarts,businessPreserved,oldTasksPreserved,newTaskIds,taskAdditionsWithinDefinition,countsBefore:Object.fromEntries(tables.map(table=>[table,initial[table].length])),countsAfter:Object.fromEntries(tables.map(table=>[table,after[table].length])),codeUnchanged:isDeepStrictEqual(beforeCode,afterCode),globalConfigSha256Before:globalBefore,globalConfigSha256After:globalAfter,globalConfigUnchanged:globalBefore===globalAfter,configuration,hostClosed,scope:'教师固定命令实验，零 thread/turn；没有模型自然选择、审批等待或文学采用。processId 是本连接标识，OS PID 和实际产物另查。'};
await writes;
for(const [name,value]of Object.entries({report,'five-tables-after':after,'code-before':beforeCode,'code-after':afterCode,'helper-commands':helperCommands}))await saveJSON(name,value);
console.log(JSON.stringify({out,mode,error,commands:commands.length,modelOrThreadStarts,businessPreserved,oldTasksPreserved,globalConfigUnchanged:report.globalConfigUnchanged}));
if(error||modelOrThreadStarts||!businessPreserved||!oldTasksPreserved||!taskAdditionsWithinDefinition||!report.codeUnchanged||!report.globalConfigUnchanged)process.exitCode=1;
