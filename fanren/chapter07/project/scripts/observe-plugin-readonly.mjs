import {getCodeVersion} from '../dist/version.js';
import {Codex} from '@openai/codex-sdk';
import {appendFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {isDeepStrictEqual} from 'node:util';
import {Store} from '../dist/store.js';
import {pluginRuntime} from './plugin-runtime.mjs';
import {archivePluginSession} from './archive-plugin-session.mjs';

const root=process.cwd(),out=resolve('runs',`plugin-readonly-${randomUUID()}`);
const binding=JSON.parse(await readFile('plugins/novel-workbench-course/binding.json','utf8'));
const database=resolve('data/fanren/reading.sqlite');
if(resolve(binding.database)!==database)throw new Error('当前插件没有绑定本节三章阅读库，请先准备阅读练习并刷新插件。');
const preflight=JSON.parse(await readFile('runs/plugin-readonly-preflight.json','utf8'));
if(!preflight.isolated||!preflight.skillsIsolated||!preflight.memoryIsolated||!preflight.bindingMatches)throw new Error('先完成插件只读目录和当前数据库绑定检查。');
const {runtime,threadOptions}=await pluginRuntime(root,{readOnly:true});
if(!isDeepStrictEqual(runtime,preflight.runtime))throw new Error('当前临时配置不同于通过的目录检查，请重新检查目录。');
const snapshot=()=>{const db=new DatabaseSync(database,{readOnly:true});try{return Object.fromEntries(['works','work_versions','chapters','chapter_versions','tasks'].map(table=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()]));}finally{db.close();}};
const store=new Store(database);
let current;
try{current={work:store.getWork('fanren'),directory:{chapters:store.listChapters('fanren')},chapters:store.listChapters('fanren').map(item=>store.getChapter('fanren',item.number))};}
finally{store.close();}
const before=snapshot();
const prompt='请使用 $novel-workbench-course:novel-chapter-review 检查作品fanren的三章原文阅读材料。读取方法及本任务需要的参考；通过插件取得当前大纲、人物设定、要求、目录和三章完整正文。区分教学章号与原书章号，核对C03正午规则、C04韩立与张铁的处理、C05墨大夫教与不教的范围，并指出人工改题索引和实际保存状态。这是只读检查，不修改、保存或采用；业务材料只通过本插件取得。';
await mkdir(out,{recursive:true});
const save=(name,value)=>writeFile(resolve(out,name),JSON.stringify(value,null,2));
await save('input.json',{database,binding,codeVersion:getCodeVersion(),runtime,threadOptions,prompt});
await save('before.json',before);
let threadId=null,completed=false,error=null,usage=null,finalResponse='';
const toolCalls=[],commands=[];
try{
  const thread=new Codex(runtime).startThread(threadOptions);
  const {events}=await thread.runStreamed(prompt,{signal:AbortSignal.timeout(600000)});
  for await(const event of events){
    await appendFile(resolve(out,'events.jsonl'),JSON.stringify(event)+'\n');
    if(event.type==='thread.started')threadId=event.thread_id;
    if(event.type==='turn.completed'){completed=true;usage=event.usage;}
    if(event.type==='turn.failed')error=event.error.message;
    if(event.type==='error')error=event.message;
    if(event.type==='item.completed'){
      if(event.item.type==='mcp_tool_call')toolCalls.push(event.item);
      if(event.item.type==='command_execution')commands.push(event.item);
      if(event.item.type==='agent_message')finalResponse=event.item.text;
    }
    console.log(JSON.stringify({event:event.type,...('item'in event?{itemType:event.item.type}:{})}));
  }
}catch(cause){error=cause.message;}
const after=snapshot(),unchanged=isDeepStrictEqual(before,after);
const toolChecks=toolCalls.map(call=>{
  let expected;
  if(call.arguments?.workId==='fanren'){
    if(call.tool==='read_work')expected=current.work;
    if(call.tool==='list_chapters')expected=current.directory;
    if(call.tool==='read_chapter')expected=current.chapters.find(item=>item.number===call.arguments.chapterNumber)??null;
  }
  return {id:call.id,server:call.server,tool:call.tool,arguments:call.arguments,status:call.status,returnedCurrentObject:expected!==undefined&&isDeepStrictEqual(call.result?.structured_content?.result,expected),error:call.error??null};
});
const readAllChapters=current.chapters.every(chapter=>toolChecks.some(call=>call.tool==='read_chapter'&&call.arguments.chapterNumber===chapter.number&&call.returnedCurrentObject));
const archive=threadId?await archivePluginSession(root,threadId,out):{archived:false,error:null};
await save('after.json',after);await writeFile(resolve(out,'final-response.txt'),finalResponse);
const report={out,threadId,completed,error,usage,unchanged,readAllChapters,toolChecks,commands,...archive,limits:'完整方法读取和文学判断需逐项核对公开事件；只读对象与全文经过独立数据库比较，目录发现不等于模型使用。'};
await save('report.json',report);console.log(JSON.stringify(report));
if(!completed||error||!unchanged||!readAllChapters||toolChecks.some(item=>!item.returnedCurrentObject))process.exitCode=1;
