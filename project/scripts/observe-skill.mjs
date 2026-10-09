import {Codex} from '@openai/codex-sdk';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,appendFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {parseArgs,isDeepStrictEqual} from 'node:util';
import {Store} from '../dist/store.js';
import {workInput,draftInput} from '../dist/schemas.js';
import {skillRuntime} from './skill-runtime.mjs';

const {values}=parseArgs({options:{scenario:{type:'string'},'run-label':{type:'string',default:'本次观察'}}});
if(!['chapter','sentence'].includes(values.scenario))throw new Error('--scenario 必须是 chapter 或 sentence。');
const root=process.cwd(),runId=randomUUID(),scenario=values.scenario;
// 先完成无模型目录预检，再使用本机临时覆盖关闭无关连接。
const preflight=JSON.parse(await readFile(resolve(root,'runs/skill-preflight.json'),'utf8'));
if(!preflight.isolated)throw new Error('先执行两次 pnpm skill:catalog --check-tools，以实际目录确认仅有三个读取工具。');
const runDir=resolve('runs',`skill-${scenario}-${runId}`),database=resolve(runDir,'workbench.sqlite');
await mkdir(runDir,{recursive:true});
const fixture=JSON.parse(await readFile('seed/章节检查.json','utf8'));
const store=new Store(database),work=workInput.parse(fixture.work);
store.init(work);
const first=store.saveDraft(draftInput.parse({workId:work.id,chapterNumber:1,expectedWorkRevision:1,expectedChapterRevision:0,expectedPreviousRevisions:[],title:fixture.firstChapter.title,body:fixture.firstChapter.body}),'human');
const adopted=store.adopt(work.id,1,first.revision,fixture.firstChapter.adoptionNote);
store.saveDraft(draftInput.parse({workId:work.id,chapterNumber:2,expectedWorkRevision:1,expectedChapterRevision:0,expectedPreviousRevisions:[{number:1,revision:adopted.revision}],title:fixture.secondChapter.title,body:fixture.secondChapter.body}),'human');
store.updateWork(workInput.parse({...work,facts:fixture.updatedFacts}),1);
const current={work:store.getWork(work.id),directory:{chapters:store.listChapters(work.id)},chapters:store.listChapters(work.id).map(item=>store.getChapter(work.id,item.number))};
store.close();
const tables=['works','work_versions','chapters','chapter_versions','tasks'];
// 全表在模型运行前后独立读取，不能用工具自己的“未修改”结论替代。
const snapshot=()=>{
  const connection=new DatabaseSync(database,{readOnly:true});
  try{return Object.fromEntries(tables.map(name=>[name,connection.prepare(`SELECT * FROM ${name} ORDER BY ${name==='works'?'id':name==='work_versions'?'work_id,revision':name==='chapters'?'work_id,number':name==='chapter_versions'?'work_id,number,revision':'id'}`).all()]));}
  finally{connection.close();}
};
const before=snapshot(),codeVersion=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const {settings,runtime,threadOptions}=await skillRuntime(root,database);
if(!isDeepStrictEqual(runtime.configOverrides.slice(1),preflight.overrides))throw new Error('本次临时覆盖与通过的目录预检不同，请重新执行目录预检。');
const prompt=scenario==='chapter'?fixture.chapterRequest:fixture.sentenceRequest;
const materialPaths=['.agents/skills/novel-chapter-review/SKILL.md','.agents/skills/novel-chapter-review/references/basis-and-status.md','.agents/skills/novel-chapter-review/references/prose-review.md'];
const materials=await Promise.all(materialPaths.map(async path=>{const text=await readFile(path,'utf8');return {path,fullPath:resolve(path),sha256:createHash('sha256').update(text).digest('hex'),text};}));
await writeFile(resolve(runDir,'input.json'),JSON.stringify({runId,label:values['run-label'],scenario,codeVersion,database,settings,runtime,threadOptions,configuredModel:null,prompt,fixtureOrigin:'人工编写的短片段与人为更新，用于方法检查；不是本轮模型生成小说。',current,materials},null,2));
await writeFile(resolve(runDir,'before-five-tables.json'),JSON.stringify(before,null,2));
console.log(JSON.stringify({runId,scenario,runDir,state:'running'}));
let threadId=null,completed=false,error=null,usage=null,finalResponse='';
const toolCalls=[],commands=[],messages=[];
try{
  const codex=new Codex(runtime),thread=codex.startThread(threadOptions);
  const {events}=await thread.runStreamed(prompt);
  // SDK 和宿主负责模型与工具执行；这里只记录公开事件。
  for await(const event of events){
    await appendFile(resolve(runDir,'events.jsonl'),JSON.stringify(event)+'\n');
    if(event.type==='thread.started')threadId=event.thread_id;
    if(event.type==='turn.completed'){completed=true;usage=event.usage;}
    if(event.type==='turn.failed')error=event.error.message;
    if(event.type==='error')error=event.message;
    if(event.type==='item.completed'){
      if(event.item.type==='mcp_tool_call')toolCalls.push(event.item);
      if(event.item.type==='command_execution')commands.push(event.item);
      if(event.item.type==='agent_message'){messages.push(event.item);finalResponse=event.item.text;}
    }
    console.log(JSON.stringify({event:event.type,...('item' in event?{itemType:event.item.type}:{}),...(event.type==='item.completed'&&event.item.type==='mcp_tool_call'?{server:event.item.server,tool:event.item.tool,status:event.item.status}:{})}));
  }
}catch(cause){error=cause instanceof Error?cause.message:String(cause);}
const after=snapshot(),unchanged=isDeepStrictEqual(before,after);
await writeFile(resolve(runDir,'after-five-tables.json'),JSON.stringify(after,null,2));
const normalized=value=>value.replaceAll('\\','/').replace(/\/+/g,'/').toLowerCase();
const text=value=>value.replaceAll('\r\n','\n').trim();
const namesMaterial=(command,material)=>normalized(command).includes(normalized(material.fullPath))||normalized(command).includes(normalized(material.path));
const materialReads=materials.map(material=>({path:material.path,fullTextSeen:commands.some(command=>command.exit_code===0&&namesMaterial(command.command,material)&&text(command.aggregated_output).includes(text(material.text))),pathMentioned:commands.some(command=>namesMaterial(command.command,material))}));
const toolChecks=toolCalls.map(call=>{
  const args=call.arguments??{};
  let expected;
  if(args.workId===work.id&&call.tool==='read_work')expected=current.work;
  if(args.workId===work.id&&call.tool==='list_chapters')expected=current.directory;
  if(args.workId===work.id&&call.tool==='read_chapter')expected=current.chapters.find(chapter=>chapter.number===args.chapterNumber)??null;
  return {id:call.id,server:call.server,tool:call.tool,arguments:call.arguments,status:call.status,allowed:call.server==='novel_lab'&&settings.enabledTools.includes(call.tool),returnedCurrentObject:expected!==undefined&&isDeepStrictEqual(call.result?.structured_content?.result,expected),error:call.error??null};
});
let archived=false,archiveError=null;
if(threadId){try{execFileSync(process.execPath,[resolve('scripts/codex-local.mjs'),'archive',threadId],{encoding:'utf8'});archived=true;}catch(cause){archiveError=cause instanceof Error?cause.message:String(cause);}}
const report={runId,scenario,codeVersion,threadId,completed,error,usage,unchanged,materialReads,toolChecks,toolCalls,commands,messages,finalResponse,archived,archiveError,limits:'自然语言选择的一次观察，不保证每轮选择相同。完整文件读取按命令输出核对；文学判断由人对照全文，未作模型自评分。仅检查，没有改稿、保存或采用，也不证明其他宿主支持相同路径。'};
await writeFile(resolve(runDir,'report.json'),JSON.stringify(report,null,2));
await writeFile(resolve(runDir,'final-response.txt'),finalResponse,'utf8');
console.log(JSON.stringify({runId,scenario,runDir,threadId,completed,error,unchanged,materialReads,toolChecks,archived}));
if(!completed||error||!unchanged||toolChecks.some(check=>!check.allowed||!check.returnedCurrentObject))process.exitCode=1;
