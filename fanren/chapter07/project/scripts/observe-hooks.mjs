import {getCodeVersion} from '../dist/version.js';
import {createRequire} from 'node:module';
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir,readFile,writeFile,appendFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {parseArgs} from 'node:util';
import {hookRuntime} from './hook-runtime.mjs';

const {values}=parseArgs({options:{prompt:{type:'string',default:'prompts/hook-scene.txt'}}});
const root=process.cwd(),out=resolve('runs',`hook-task-${randomUUID()}`);
const review=JSON.parse(await readFile('runs/hook-trust-review.json','utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
// 只接受主编已经逐文件审核的定义，信任记录仅用于当前宿主进程。
if(review.approvedBy!=='root'||review.approvedHooks?.length!==3||!review.definitionFiles?.length)throw new Error('缺少完整定义审核与三个精确信任条目。');
for(const item of review.definitionFiles)if(sha(await readFile(resolve(root,item.path)))!==item.sha256)throw new Error(`审核后文件发生变化：${item.path}`);
const {runtime,settings,database}=await hookRuntime(root,{executeHooks:true});
const prompt=await readFile(resolve(values.prompt),'utf8');
const snapshot=()=>{
 const db=new DatabaseSync(database,{readOnly:true});
 try{return Object.fromEntries(['works','work_versions','chapters','chapter_versions','tasks'].map(table=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()]));}
 finally{db.close();}
};
const before=snapshot();
if(before.works.length!==1||before.works[0].id!=='qinglan'||before.chapters.length||before.chapter_versions.length||before.tasks.length)throw new Error('本实验需要已初始化但尚无章节的新作品；不会自动清库或重试。');
const configFile=resolve(process.env.USERPROFILE,'.codex/config.toml');
const configHashBefore=sha(await readFile(configFile));
await mkdir(out,{recursive:true});
await writeFile(resolve(out,'input.json'),JSON.stringify({root,out,database,codeVersion:getCodeVersion(),runtime,prompt,review,limits:'单条自然任务交给官方 app-server；此脚本只记录公开事件与只读结果，不决定工具调用、不执行模型循环。'},null,2));
await writeFile(resolve(out,'before.json'),JSON.stringify(before,null,2));

const require=createRequire(import.meta.resolve('@openai/codex-sdk'));
const entry=require.resolve('@openai/codex/bin/codex.js');
const child=spawn(process.execPath,[entry,...runtime.configOverrides.flatMap(value=>['-c',value]),'app-server','--stdio'],{cwd:root,stdio:['pipe','pipe','pipe'],windowsHide:true});
const pending=new Map(),notifications=[],errors=[];
let nextId=0,threadId=null,turnId=null,turn=null,thread=null,hooks=null,status=null,skills=null,error=null,archived=false,finalResponse='',model=null,modelProvider=null,usage=null,writes=Promise.resolve();
let finishTurn,failTurn;
const completion=new Promise((resolve,reject)=>{finishTurn=resolve;failTurn=reject;});
// 预检失败时也保留宿主退出结果，避免尚未等待任务完成的 Promise 成为未处理拒绝。
completion.catch(()=>{});
// 在发送 turn/start 前完成目录和配置核对，避免把配置存在当作已隔离。
const record=(direction,message)=>{writes=writes.then(()=>appendFile(resolve(out,'protocol.jsonl'),JSON.stringify({direction,message})+'\n'));};
const lines=createInterface({input:child.stdout});
lines.on('line',line=>{
 const message=JSON.parse(line),waiting=pending.get(message.id);
 const recorded=waiting?.method==='config/read'&&message.result?{...message,result:{config:Object.fromEntries(['features','memories','skills','project_doc_max_bytes','developer_instructions'].map(key=>[key,message.result.config[key]])),limits:'其他用户配置正文不收录；这条消息不是全原字节公开。'}}:message;
 record('received',recorded);
 if(waiting){pending.delete(message.id);clearTimeout(waiting.timeout);message.error?waiting.reject(new Error(JSON.stringify(message.error))):waiting.resolve(message.result);return;}
 if(message.method){
  notifications.push(message);
  if(message.method==='item/completed'&&message.params?.item?.type==='agentMessage')finalResponse=message.params.item.text;
  if(message.method==='thread/tokenUsage/updated')usage=message.params.tokenUsage;
  if(message.method==='turn/completed'&&message.params.threadId===threadId){turn=message.params.turn;finishTurn(turn);}
  if(['hook/started','hook/completed','item/completed','turn/completed'].includes(message.method))console.log(JSON.stringify({event:message.method,itemType:message.params?.item?.type,hookStatus:message.params?.run?.status,displayOrder:message.params?.run?.displayOrder}));
  if(message.id!==undefined)send({id:message.id,error:{code:-32601,message:'本实验记录客户端不处理交互请求；未自动批准。'}});
 }
});
child.stderr.on('data',chunk=>errors.push(chunk.toString()));
const rejectWaiting=cause=>{
 for(const waiting of pending.values()){clearTimeout(waiting.timeout);waiting.reject(cause);}pending.clear();
 if(!turn)failTurn(cause);
};
child.on('exit',code=>rejectWaiting(new Error(`宿主进程退出：${code}`)));
child.on('error',rejectWaiting);
const send=message=>{record('sent',message);child.stdin.write(JSON.stringify(message)+'\n');};
const request=(method,params)=>new Promise((resolve,reject)=>{
 const id=++nextId,timeout=setTimeout(()=>{pending.delete(id);reject(new Error(`宿主请求超时：${method}，未自动重试。`));},45000);
 pending.set(id,{method,resolve,reject,timeout});send({id,method,params});
});
let timeout=null;
try{
 await request('initialize',{clientInfo:{name:'hook_course_observer',version:'1.0.0'},capabilities:{experimentalApi:true}});
 send({method:'initialized',params:{}});
 const configuration=(await request('config/read',{cwd:root,includeLayers:false})).config;
 if(configuration.features?.hooks!==true||configuration.features?.shell_tool!==false||configuration.memories?.use_memories!==false||configuration.memories?.generate_memories!==false||configuration.project_doc_max_bytes!==0||configuration.developer_instructions)throw new Error('实际配置未符合已审核输入与执行范围。');
 hooks=await request('hooks/list',{cwds:[root]});
 const entries=hooks.data.find(item=>resolve(item.cwd)===root);
 if(!entries||entries.errors.length||entries.hooks.length!==3||entries.hooks.some(item=>item.source!=='project'||item.trustStatus!=='trusted'||!item.enabled||!review.approvedHooks.some(approved=>approved.key===item.key&&approved.currentHash===item.currentHash)))throw new Error('实际 Hook 目录与精确信任范围不一致。');
 skills=await request('skills/list',{cwds:[root],forceReload:true});
 if(skills.data.some(item=>item.skills.some(skill=>skill.enabled)))throw new Error('本次目录仍有未审核的启用 Skill。');
 const started=await request('thread/start',{cwd:root,sandbox:'read-only',approvalPolicy:'never'});
 threadId=started.thread.id;model=started.model;modelProvider=started.modelProvider;
 status=await request('mcpServerStatus/list',{threadId,detail:'toolsAndAuthOnly'});
 const inventory=status.data.filter(item=>Object.keys(item.tools??{}).length),own=inventory.find(item=>!item.pluginId&&item.name===settings.serverName);
 if(inventory.length!==1||!own||Object.keys(own.tools).sort().join(',')!==[...settings.enabledTools].sort().join(','))throw new Error('当前会话不只有已审核四个业务工具。');
 // 唯一一次 turn/start；后续选择、Hook 触发和保存都由成熟宿主完成。
 const startedTurn=await request('turn/start',{threadId,input:[{type:'text',text:prompt}]});
 turnId=startedTurn.turn.id;
 timeout=setTimeout(()=>{
  if(turn)return;
  request('turn/interrupt',{threadId,turnId}).catch(()=>{});
  failTurn(new Error('本次单条任务超过 10 分钟；已请求宿主中断，不自动重试。'));
 },600000);
 await completion;
 thread=await request('thread/read',{threadId,includeTurns:true});
}catch(cause){error=cause instanceof Error?cause.message:String(cause);}
finally{
 clearTimeout(timeout);
 if(threadId){try{await request('thread/archive',{threadId});archived=true;}catch(cause){error??=`归档失败：${cause.message}`;}}
 child.stdin.end();
 const stopping=setTimeout(()=>child.kill(),10000);
 await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));
 clearTimeout(stopping);lines.close();await writes;
}
const after=snapshot(),configHashAfter=sha(await readFile(configFile));
const cli=spawnSync(process.execPath,['dist/cli.js','chapter','1','--db',database,'--work','qinglan'],{cwd:root,encoding:'utf8',windowsHide:true});
await writeFile(resolve(out,'人工入口完整章节.json'),cli.stdout);
await writeFile(resolve(out,'人工入口stderr.txt'),cli.stderr);
for(const [name,value]of Object.entries({after,hooks,'mcp-status':status,skills,thread,notifications}))await writeFile(resolve(out,name+'.json'),JSON.stringify(value,null,2));
await writeFile(resolve(out,'stderr.txt'),errors.join(''));
await writeFile(resolve(out,'final-response.txt'),finalResponse);
const report={out,threadId,turnId,turnStatus:turn?.status??null,completed:turn?.status==='completed',error,archived,model,modelProvider,usage,cliExitCode:cli.status,globalConfigHashBefore:configHashBefore,globalConfigHashAfter:configHashAfter,globalConfigUnchanged:configHashBefore===configHashAfter,countsBefore:Object.fromEntries(Object.entries(before).map(([key,rows])=>[key,rows.length])),countsAfter:Object.fromEntries(Object.entries(after).map(([key,rows])=>[key,rows.length])),limits:'完整公开任务事件与实际业务结果需人工逐项核对；config/read 的无关用户配置已过滤，不声称全协议原字节公开。Hook 触发和标记检查不证明文学质量，也不证明 Hook 是修改的独立因果。'};
await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
if(error||turn?.status!=='completed')process.exitCode=1;
