import {Codex} from '@openai/codex-sdk';
import {mkdir,readFile,writeFile,appendFile,copyFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const [phase,resume]=process.argv.slice(2);
if(!['read','continue'].includes(phase)||(phase==='continue'&&!resume))throw new Error('用法：node handoff/run.mjs read 或 continue <待选轮记录目录>。');
const directory=resolve('handoff/records',new Date().toISOString().replaceAll(':','-')+'-'+randomUUID());
await mkdir(directory,{recursive:true});
const prior=resume?JSON.parse(await readFile(resolve(resume,'report.json'),'utf8')):null;
const workingDirectory=prior?.workingDirectory??join(directory,'current');
if(!prior){await mkdir(workingDirectory);for(const name of await readdir('handoff/materials/before'))await copyFile(resolve('handoff/materials/before',name),join(workingDirectory,name));}
const names=phase==='read'?['original.md','notes.md','plans.md','current-task.md']:['original.md','notes.md','plans.md','current-task.md','human-decision.md'];
const files=Object.fromEntries(await Promise.all(names.map(async name=>[name,await readFile(join(workingDirectory,name),'utf8')])));
const digest=t=>createHash('sha256').update(t).digest('hex');
const prompt=`这是课堂阅读笔记交接实验，不写小说。请使用本机只读文件工具完整读取当前目录的${names.join('、')}。只读这几份文件，不读取其他资料，不调用MCP、网络或其他Agent，不修改文件。${phase==='read'?'按current-task.md停在待选位置，简短说明缺哪项选择，等待人的实际决定，不交摘要。':'同一会话中人的材料已经变化，旧备选不是当前决定。请重读当前全文，最终只列current-task.md要求的两项问题与各一句影响，不改写摘要，不重复问原文事实，不恢复A/B待选状态。'}不要声称采用或发布；回答由外部记录程序保存。`;
await writeFile(join(directory,'input.json'),JSON.stringify({phase,workingDirectory,codeCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),requestedThreadId:prior?.threadId??null,prompt,files,hashes:Object.fromEntries(Object.entries(files).map(([name,text])=>[name,digest(text)]))},null,2)+'\n');
let config={};try{config=JSON.parse(await readFile('lab.config.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const codex=new Codex({codexPathOverride:config.codexPathOverride,config:{memories:{use_memories:false,generate_memories:false}}});
const options={workingDirectory,skipGitRepoCheck:true,sandboxMode:'read-only',approvalPolicy:'never',webSearchMode:'disabled',modelReasoningEffort:'low',model:config.model};
const thread=prior?codex.resumeThread(prior.threadId,options):codex.startThread(options);
let threadId=prior?.threadId??null,answer='',usage=null,error=null,completed=false;
try{
  const {events}=await thread.runStreamed(prompt,{signal:AbortSignal.timeout(180000)});
  for await(const event of events){
    await appendFile(join(directory,'events.jsonl'),JSON.stringify(event)+'\n');
    if(event.type==='thread.started')threadId=event.thread_id;
    if(event.type==='turn.completed'){completed=true;usage=event.usage;}
    if(event.type==='turn.failed')error=event.error.message;
    if(event.type==='error')error=event.message;
    if(event.type==='item.completed'&&event.item.type==='agent_message')answer=event.item.text;
  }
}catch(cause){error=cause.message;}
// 文件与公开工具事件分开核对，不以模型自述代替读取证据。
const after=Object.fromEntries(await Promise.all(names.map(async name=>[name,await readFile(join(workingDirectory,name),'utf8')])));
const report={phase,workingDirectory,threadId,completed,error,usage,answer,filesUnchanged:Object.entries(files).every(([name,text])=>text===after[name])};
await writeFile(join(directory,'answer.md'),answer,'utf8');
await writeFile(join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({directory,...report,answer:undefined}));
if(!completed||error||!answer.trim())process.exitCode=1;
