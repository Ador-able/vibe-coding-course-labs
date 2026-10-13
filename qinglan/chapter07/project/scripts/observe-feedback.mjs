import {getCodeVersion} from '../dist/version.js';
import {createRequire} from 'node:module';
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir,readFile,writeFile,appendFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {feedbackRuntime,configurationProjection} from './feedback-runtime.mjs';

const root=process.cwd(),out=resolve('runs',`feedback-task-${randomUUID()}`);
const review=JSON.parse(await readFile('runs/feedback-trust-review.json','utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
// 信任仅接受主编核读后冻结的一个项目Hook及完整定义文件。
if(review.approvedBy!=='root'||review.approvedHooks?.length!==1||!review.definitionFiles?.length)throw new Error('缺少当前项目完整定义审核与唯一精确信任条目。');
for(const file of review.definitionFiles)if(sha(await readFile(resolve(root,file.path)))!==file.sha256)throw new Error(`审核后文件改变：${file.path}`);
const {runtime,settings,database}=await feedbackRuntime(root,{executeHooks:true});
const prompt=await readFile('prompts/反馈任务.txt','utf8');
const snapshot=()=>{
 const db=new DatabaseSync(database,{readOnly:true});
 try{return Object.fromEntries(['works','work_versions','chapters','chapter_versions','tasks'].map(table=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()]));}
 finally{db.close();}
};
const before=snapshot(),manualBaseline=JSON.parse(await readFile('runs/人工准备/五表人工基线.json','utf8'));
if(JSON.stringify(before)!==JSON.stringify(manualBaseline))throw new Error('真实业务状态已不同于冻结人工r2基线，未调用模型。');
const globalConfig=resolve(process.env.USERPROFILE,'.codex/config.toml'),globalBefore=sha(await readFile(globalConfig));
await mkdir(out,{recursive:true});
await writeFile(resolve(out,'input.json'),JSON.stringify({root,out,database,codeVersion:getCodeVersion(),runtime,settings,prompt,review,scope:'一条官方自然任务；新增保存次数为给模型的软限制。观察器不决定业务动作、不手工保存、不自动续发。'},null,2));
await writeFile(resolve(out,'before.json'),JSON.stringify(before,null,2));
const require=createRequire(import.meta.resolve('@openai/codex-sdk'));
const entry=require.resolve('@openai/codex/bin/codex.js');
const child=spawn(process.execPath,[entry,...runtime.configOverrides.flatMap(value=>['-c',value]),'app-server','--stdio'],{cwd:root,stdio:['pipe','pipe','pipe'],windowsHide:true});
const pending=new Map(),notifications=[],stderr=[];
let nextId=0,threadId=null,turnId=null,turn=null,thread=null,hooks=null,skills=null,status=null,error=null,archived=false,finalResponse='',usage=null,model=null,modelProvider=null,writes=Promise.resolve(),timeout=null,interruptGrace=null,interruptRequested=false,interruptResult=null,interruption=null;
let finishTurn,failTurn,finishTerminal;
const completion=new Promise((resolve,reject)=>{finishTurn=resolve;failTurn=reject;});
const terminalObserved=new Promise(resolve=>{finishTerminal=resolve;});
// 预检失败也观察原Promise的拒绝；实际任务仍等待原Promise，不吞掉错误。
completion.catch(()=>{});
const record=(direction,message)=>{writes=writes.then(()=>appendFile(resolve(out,'protocol.jsonl'),JSON.stringify({direction,message})+'\n'));};
const lines=createInterface({input:child.stdout});
lines.on('line',line=>{
 const message=JSON.parse(line),waiting=pending.get(message.id);
 const recorded=waiting?.method==='config/read'&&message.result?{...message,result:configurationProjection(message.result,root)}:message;
 record('received',recorded);
 if(waiting){pending.delete(message.id);clearTimeout(waiting.timeout);message.error?waiting.reject(new Error(JSON.stringify(message.error))):waiting.resolve(message.result);return;}
 if(message.method){
  notifications.push(message);
  if(message.method==='item/completed'&&message.params?.item?.type==='agentMessage')finalResponse=message.params.item.text;
  if(message.method==='thread/tokenUsage/updated')usage=message.params.tokenUsage;
  if(message.method==='turn/completed'&&message.params.threadId===threadId){turn=message.params.turn;finishTurn(turn);finishTerminal(turn);}
  if(['hook/started','hook/completed','item/completed','turn/completed'].includes(message.method))console.log(JSON.stringify({event:message.method,itemType:message.params?.item?.type,hookStatus:message.params?.run?.status}));
  if(message.id!==undefined)send({id:message.id,error:{code:-32601,message:'记录客户端不处理交互批准，不自动批准。'}});
 }
});
child.stderr.on('data',chunk=>stderr.push(chunk.toString()));
const fail=cause=>{
 for(const waiting of pending.values()){clearTimeout(waiting.timeout);waiting.reject(cause);}pending.clear();
 if(!turn)failTurn(cause);
};
child.stdin.on('error',fail);
child.on('exit',code=>fail(new Error(`宿主进程退出：${code}`)));
child.on('error',fail);
const send=message=>{record('sent',message);child.stdin.write(JSON.stringify(message)+'\n');};
const request=(method,params)=>new Promise((resolve,reject)=>{
 const id=++nextId,waiting={method,resolve,reject,timeout:null};
 waiting.timeout=setTimeout(()=>{pending.delete(id);reject(new Error(`请求超时：${method}；不自动重试。`));},45000);
 pending.set(id,waiting);send({id,method,params});
});
const interrupt=()=>{
 if(interruptRequested||!turnId||turn)return;
 interruptRequested=true;
 interruption=request('turn/interrupt',{threadId,turnId}).then(result=>{interruptResult=result;},cause=>{error??=`中断请求失败：${cause.message}`;});
 // 请求中断后继续等真实turn/completed，不能把请求成功当作已经停止。
 interruptGrace=setTimeout(()=>{if(!turn)failTurn(new Error('中断后45秒仍未确认真实终态；保存状态随后读回，不自动续发。'));},settings.interruptGraceMs);
};
try{
 await request('initialize',{clientInfo:{name:'feedback_course_observer',version:'1.0.0'},capabilities:{experimentalApi:true}});
 send({method:'initialized',params:{}});
 const configuration=configurationProjection(await request('config/read',{cwd:root,includeLayers:false}),root);
 if(configuration.features?.hooks!==true||configuration.features?.shell_tool!==true||configuration.memories?.use_memories!==false||configuration.memories?.generate_memories!==false||configuration.project_doc_max_bytes!==0||configuration.developerInstructionsPresent)throw new Error('实际配置不符合冻结的读取与执行范围。');
 hooks=await request('hooks/list',{cwds:[root]});
 const listed=hooks.data.find(item=>resolve(item.cwd)===root),approved=review.approvedHooks[0];
 if(!listed||listed.errors.length||listed.hooks.length!==1||listed.hooks[0].source!=='project'||listed.hooks[0].trustStatus!=='trusted'||!listed.hooks[0].enabled||listed.hooks[0].key!==approved.key||listed.hooks[0].currentHash!==approved.currentHash)throw new Error('实际唯一Hook未符合本进程精确信任。');
 skills=await request('skills/list',{cwds:[root],forceReload:true});
 const enabled=skills.data.find(item=>resolve(item.cwd)===root)?.skills.filter(item=>item.enabled)??[];
 if(enabled.length!==1||enabled[0].name!==settings.skillName||resolve(enabled[0].path)!==resolve(root,settings.skillPath))throw new Error('实际启用方法不只有当前项目Skill。');
 const started=await request('thread/start',{cwd:root,model:settings.model,sandbox:'read-only',approvalPolicy:'never'});
 threadId=started.thread.id;model=started.model;modelProvider=started.modelProvider;
 if(settings.model&&model!==settings.model)throw new Error('宿主实际模型与明确请求不同，未开始任务。');
 status=await request('mcpServerStatus/list',{threadId,detail:'toolsAndAuthOnly'});
 const inventory=status.data.filter(item=>Object.keys(item.tools??{}).length),own=inventory.find(item=>!item.pluginId&&item.name===settings.serverName);
 if(inventory.length!==1||!own||Object.keys(own.tools).sort().join(',')!==settings.enabledTools.slice().sort().join(','))throw new Error('当前会话未隔离为指定四个业务工具。');
 // 唯一一次turn/start；实际方法读取、保存和Hook触发由成熟宿主承担。
 const startedTurn=await request('turn/start',{threadId,input:[{type:'text',text:prompt}]});
 turnId=startedTurn.turn.id;timeout=setTimeout(interrupt,settings.turnTimeoutMs);
 await completion;
 if(interruption)await interruption;
 thread=await request('thread/read',{threadId,includeTurns:true});
}catch(cause){
 error??=cause instanceof Error?cause.message:String(cause);
 if(turnId&&!turn&&!interruptRequested&&child.exitCode===null&&!child.stdin.destroyed){
  interrupt();
  let waiting;
  await Promise.race([terminalObserved,new Promise(resolve=>{waiting=setTimeout(resolve,settings.interruptGraceMs);})]);
  clearTimeout(waiting);
  if(interruption)await interruption;
 }
}
finally{
 clearTimeout(timeout);clearTimeout(interruptGrace);
 if(threadId&&(!turnId||turn)){
  try{await request('thread/archive',{threadId});archived=true;}
  catch(cause){error??=`归档失败：${cause.message}`;}
 }
 child.stdin.end();const killing=setTimeout(()=>child.kill(),10000);
 await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));
 clearTimeout(killing);lines.close();await writes;
}
const after=snapshot(),globalAfter=sha(await readFile(globalConfig));
const cli=spawnSync(process.execPath,['dist/cli.js','chapter','1','--db',database,'--work',settings.workId],{cwd:root,encoding:'utf8',windowsHide:true});
await writeFile(resolve(out,'人工入口完整章节.json'),cli.stdout??'');
await writeFile(resolve(out,'人工入口stderr.txt'),cli.stderr??'');
for(const [name,value]of Object.entries({after,hooks,skills,'mcp-status':status,thread,notifications}))await writeFile(resolve(out,name+'.json'),JSON.stringify(value,null,2));
await writeFile(resolve(out,'stderr.txt'),stderr.join(''));
await writeFile(resolve(out,'final-response.txt'),finalResponse);
const newDrafts=after.chapter_versions.length-before.chapter_versions.length;
const report={out,threadId,turnId,turnStatus:turn?.status??null,terminalConfirmed:!!turn,completed:turn?.status==='completed',error,archived,model,modelProvider,usage,interruptRequested,interruptResult,hostExitCode:child.exitCode,hostSignalCode:child.signalCode,timeoutAnchor:'从turn/start返回真实turnId后计时；5分钟请求中断，另等最多45秒真实终态，不等于费用硬上限。',cliExitCode:cli.status,newDrafts,saveInstructionLimitExceeded:newDrafts>settings.maxNewDraftsInstruction,countsBefore:Object.fromEntries(Object.entries(before).map(([name,rows])=>[name,rows.length])),countsAfter:Object.fromEntries(Object.entries(after).map(([name,rows])=>[name,rows.length])),globalConfigHashBefore:globalBefore,globalConfigHashAfter:globalAfter,globalConfigUnchanged:globalBefore===globalAfter,limits:'事件、全文与范围需独立人工核对。记录不收录宿主system/developer、身份或记忆受保护正文；本实验Hook反馈、教师输入与真实业务结果单独保存。机械通过不证明场景或文学品质；单次复用不证明因果收益。'};
await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
if(error||turn?.status!=='completed')process.exitCode=1;
