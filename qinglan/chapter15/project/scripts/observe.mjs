import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {parseArgs,isDeepStrictEqual} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {host,configurationProjection} from './host.mjs';
import {officialEntry} from './codex-local.mjs';

const root=resolve('.'),settings=JSON.parse(readFileSync('config/固定实验参数.json','utf8'));
const {positionals,values}=parseArgs({allowPositionals:true,options:{record:{type:'string'}}});
const [mode,task]=positionals,definitions={investigation:{prompt:'162-完整调查任务.txt',readOnly:true,budget:0,cwd:root},rules:{prompt:'164-完整规则调查任务.txt',readOnly:true,budget:32768,cwd:resolve('prototype')},tests:{prompt:'165-完整测试任务.txt',readOnly:false,budget:32768,cwd:root},review:{prompt:'170-完整原生评审任务.txt',readOnly:true,budget:32768,cwd:root},delivery:{prompt:'177-完整交付任务.txt',readOnly:false,budget:32768,cwd:root}};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
const version=execFileSync(process.execPath,[officialEntry,'--version'],{encoding:'utf8'}).trim();
if(version!=='codex-cli '+settings.sdk)throw new Error('实际原生宿主版本不是冻结版本。');
if(!['preflight','rules-sources','task','review'].includes(mode))throw new Error('入口为preflight、rules-sources、task或review。');
const definition=mode==='review'?definitions.review:definitions[task];
if(['task','review'].includes(mode)&&!definition)throw new Error('任务为investigation、rules、tests、review或delivery。');
if(mode==='task'&&task==='review')throw new Error('评审使用原生review入口，不发普通turn。');
if(mode!=='preflight'){
  execFileSync(process.execPath,['scripts/check-source.mjs'],{stdio:'pipe'});
  if(task==='delivery'||mode==='review'){
    const prior=JSON.parse(readFileSync(`inputs/${task==='delivery'?'177-前置实录索引':'170-评审对象'}.json`,'utf8'));
    if(prior.state!=='ready'||!prior.files.length)throw new Error('实际前置资料未准备，未调用模型。');
    for(const file of prior.files)if(sha(readFileSync(resolve(root,file.path)))!==file.sha256)throw new Error('实际前置原件SHA改变：'+file.path);
  }
}
const name=values.record??`${mode}-${task??'directory'}-${randomUUID()}`;
if(!/^[a-zA-Z0-9-]+$/.test(name))throw new Error('记录名只用字母、数字和连字符。');
const out=resolve('runs',name);if(existsSync(out))throw new Error('记录目录已存在，使用新名称；不会覆盖课堂原件。');mkdirSync(out,{recursive:true});
const write=(name,value)=>writeFileSync(resolve(out,name+'.json'),JSON.stringify(value,null,2)+'\n');
const codeState=()=>({gitRoot:git('rev-parse','--show-toplevel').trim(),head:git('rev-parse','HEAD').trim(),status:git('status','--porcelain=v1','--untracked-files=all'),diff:git('diff','--binary'),indexDiff:git('diff','--cached','--binary')});
const databaseState=()=>{
  if(!existsSync('practice.json'))return null;
  const practice=JSON.parse(readFileSync('practice.json','utf8')),db=new DatabaseSync(practice.database,{readOnly:true});
  try{return {practice,databaseSha256:sha(readFileSync(practice.database)),fiveTables:Object.fromEntries(['works','work_versions','chapters','chapter_versions','tasks'].map(name=>[name,db.prepare(`SELECT * FROM ${name} ORDER BY 1,2`).all().map(row=>({...row}))]))};}finally{db.close();}
};
const before={code:codeState(),database:databaseState()},cases=[];write('before',before);
async function observeCase({label,cwd,budget,readOnly,prompt=null,nativeReview=false}){
  let h,started,threadId,turnId,turn,error=null,processExit,timeout,grace,interrupted=false,finalResponse='',reviewResponse=null,usage=null;
  const terminal=[];let finish,fail;
  const completion=new Promise((done,reject)=>{finish=done;fail=reject;});completion.catch(()=>{});
  const itemOut=resolve(out,label);mkdirSync(itemOut,{recursive:false});
  const localWrite=(name,value)=>writeFileSync(resolve(itemOut,name+'.json'),JSON.stringify(value,null,2)+'\n');
  h=host({cwd,out:itemOut,settings,docBudget:budget,readOnly,onFailure:cause=>{error??=cause.message;if(!turn)fail(cause);},onNotification:message=>{
    if(message.method==='item/completed'&&message.params?.item?.type==='agentMessage')finalResponse=message.params.item.text;
    if(message.method==='item/completed'&&message.params?.item?.type==='exitedReviewMode')reviewResponse=message.params.item.review;
    if(message.method==='thread/tokenUsage/updated')usage=message.params.tokenUsage;
    if(message.method==='turn/completed'&&message.params.threadId===threadId){terminal.push(message.params.turn);if(!turnId||message.params.turn.id===turnId){turn=message.params.turn;finish(turn);}}
    if(message.method==='item/completed')console.log(JSON.stringify({event:message.method,type:message.params?.item?.type,label}));
  }});
  const interrupt=async()=>{
    if(!turnId||turn||interrupted)return;interrupted=true;
    try{await h.request('turn/interrupt',{threadId,turnId});}catch(cause){error??=cause.message;}
    grace=setTimeout(()=>fail(new Error('中断后未取得真实终态；未补发。')),settings.limits.interruptGraceMs);
  };
  const directories={};
  try{
    await h.request('initialize',{clientInfo:{name:'qinglan_ch15_observer',version:'1.0.0'},capabilities:{experimentalApi:true}});h.send({method:'initialized',params:{}});
    directories.configuration=configurationProjection(await h.request('config/read',{cwd,includeLayers:false}));
    directories.hooks=await h.request('hooks/list',{cwds:[cwd]});directories.skills=await h.request('skills/list',{cwds:[cwd],forceReload:true});
    if(directories.configuration.developerInstructionsPresent||directories.configuration.features?.apps!==false||directories.configuration.features?.hooks!==false||directories.configuration.web_search!=='disabled'||directories.skills.data.some(item=>item.skills.some(skill=>skill.enabled)||item.errors?.length)||directories.hooks.data.some(item=>item.hooks.length||item.errors.length))throw new Error('实际目录超出冻结范围；未调用模型。');
      started=await h.request('thread/start',{cwd,model:settings.model,runtimeWorkspaceRoots:[root],sandbox:readOnly?'read-only':'workspace-write',approvalPolicy:'never'});threadId=started.thread.id;
      directories.mcp=await h.request('mcpServerStatus/list',{threadId,detail:'toolsAndAuthOnly'});
      if(started.model!==settings.model||started.approvalPolicy!=='never'||directories.mcp.data.some(item=>Object.keys(item.tools??{}).length))throw new Error('实际模型、权限或MCP目录超出冻结范围；未调用模型。');
      if(prompt){
        const parameters=nativeReview?{threadId,target:{type:'custom',instructions:prompt},delivery:'inline'}:{threadId,input:[{type:'text',text:prompt}],approvalPolicy:'never',sandboxPolicy:readOnly?{type:'readOnly',networkAccess:false}:{type:'workspaceWrite',writableRoots:[task==='delivery'?before.code.gitRoot:root],networkAccess:false,excludeTmpdirEnvVar:true,excludeSlashTmp:true}};
        localWrite('input',{version,nodeVersion:process.version,gitHead:before.code.head,source:JSON.parse(readFileSync('source-version.json','utf8')),parameters,prompt,promptSha256:sha(Buffer.from(prompt)),configuration:directories.configuration,configOverrides:h.overrides});
        const submitted=await h.request(nativeReview?'review/start':'turn/start',parameters);turnId=submitted.turn.id;localWrite('submitted',submitted);
        const already=terminal.find(item=>item.id===turnId);if(already){turn=already;finish(turn);}
        timeout=setTimeout(()=>{interrupt().catch(cause=>fail(cause));},settings.limits[(nativeReview?'review':task)+'Ms']);
        await completion;
        localWrite('thread',await h.request('thread/read',{threadId,includeTurns:true}));
      }
  }catch(cause){error??=cause.message;if(turnId&&!turn&&h.child.exitCode===null){await interrupt();try{await completion;}catch{}}}
  finally{
    clearTimeout(timeout);clearTimeout(grace);
    if(threadId&&h.child.exitCode===null&&!h.child.stdin.destroyed){try{await h.request('thread/archive',{threadId});}catch(cause){error??=cause.message;}}
    processExit=await h.close();
  }
  const count=method=>h.protocol.filter(item=>item.direction==='sent'&&item.message.method===method).length;
  const report={label,cwd,budget,version,model:started?.model??null,modelProvider:started?.modelProvider??null,instructionSources:started?.instructionSources??null,threadId:threadId??null,turnId:turnId??null,turn:turn??null,usage,error,interrupted,processExit,threadStarts:count('thread/start'),ordinaryTurnStarts:count('turn/start'),reviewStarts:count('review/start'),commands:h.notifications.filter(item=>item.method==='item/completed'&&item.params.item?.type==='commandExecution').map(item=>item.params.item),fileChanges:h.notifications.filter(item=>item.method==='item/completed'&&item.params.item?.type==='fileChange').map(item=>item.params.item),scope:prompt?'一次自然客户端任务，底层调用数未从轮次推断。':'空会话/目录查询，没有模型任务。'};
  localWrite('directories',directories);localWrite('report',{...report,reviewVisibleText:reviewResponse});
  writeFileSync(resolve(itemOut,'final-response.txt'),nativeReview?reviewResponse??'':finalResponse);
  if(nativeReview)writeFileSync(resolve(itemOut,'agent-message.txt'),finalResponse);
  return report;
}
if(mode==='rules-sources')for(const condition of [{label:'A-root',cwd:root,budget:32768},{label:'B-prototype',cwd:resolve('prototype'),budget:32768},{label:'C-zero',cwd:resolve('prototype'),budget:0}]){const item=await observeCase({...condition,readOnly:true});cases.push(item);if(item.error)break;}
else cases.push(await observeCase({label:mode==='preflight'?'directory':task??'review',cwd:definition?.cwd??root,budget:mode==='preflight'?0:definition?.budget??32768,readOnly:definition?.readOnly??true,prompt:definition?readFileSync('inputs/'+definition.prompt,'utf8'):null,nativeReview:mode==='review'}));
const after={code:codeState(),database:databaseState()};write('after',after);
const report={out,mode,task:task??null,version,cases,sourceUnchanged:isDeepStrictEqual(before.code,after.code),businessUnchanged:isDeepStrictEqual(before.database,after.database),ordinaryTurnStarts:cases.reduce((sum,item)=>sum+item.ordinaryTurnStarts,0),reviewStarts:cases.reduce((sum,item)=>sum+item.reviewStarts,0),limits:'只读沙箱不表示目录外文件绝对不可读；任务范围、实际命令和前后对象另核。没有自动续发、重试或业务生成。'};write('report',report);
console.log(JSON.stringify({out,mode,cases:cases.length,ordinaryTurnStarts:report.ordinaryTurnStarts,reviewStarts:report.reviewStarts,errors:cases.map(item=>item.error).filter(Boolean),businessUnchanged:report.businessUnchanged}));
if(cases.some(item=>item.error)||!report.businessUnchanged||((definition?.readOnly??true)&&!report.sourceUnchanged)||(definition&&cases.some(item=>item.turn?.status!=='completed')))process.exitCode=1;
