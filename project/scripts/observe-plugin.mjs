import {Codex} from '@openai/codex-sdk';
import {appendFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {parseArgs} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {pluginRuntime} from './plugin-runtime.mjs';
import {archivePluginSession} from './archive-plugin-session.mjs';

const {values}=parseArgs({options:{db:{type:'string',default:'data/plugin.sqlite'},work:{type:'string',default:'clocktower'},chapter:{type:'string',default:'1'},prompt:{type:'string'}}});
if(!values.prompt)throw new Error('需要保存了完整请求的提示文件。');
const root=process.cwd(),database=resolve(values.db),out=resolve('runs',randomUUID());
const preflight=JSON.parse(await readFile('runs/plugin-preflight.json','utf8'));
if(!preflight.isolated||!preflight.skillsIsolated||!preflight.memoryIsolated||preflight.skills.length!==2)throw new Error('插件 Skill、四工具与记忆配置尚未通过本机隔离检查。');
const {runtime,threadOptions}=await pluginRuntime(root);
const prompt=await readFile(values.prompt,'utf8');
const snapshot=()=>{const db=new DatabaseSync(database,{readOnly:true});try{return Object.fromEntries(['works','work_versions','chapters','chapter_versions','tasks'].map(table=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()]));}finally{db.close();}};
const before=snapshot();
await mkdir(out,{recursive:true});
await writeFile(resolve(out,'input.json'),JSON.stringify({root,database,workId:values.work,chapterNumber:Number(values.chapter),runtime,threadOptions,prompt},null,2));
await writeFile(resolve(out,'before.json'),JSON.stringify(before,null,2));
console.log(JSON.stringify({out,state:'running'}));
let threadId=null,completed=false,error=null,finalResponse='',usage=null;
try{
  const thread=new Codex(runtime).startThread(threadOptions);
  const {events}=await thread.runStreamed(prompt);
  for await(const event of events){
    await appendFile(resolve(out,'events.jsonl'),JSON.stringify(event)+'\n');
    if(event.type==='thread.started')threadId=event.thread_id;
    if(event.type==='turn.completed'){completed=true;usage=event.usage;}
    if(event.type==='turn.failed')error=event.error.message;
    if(event.type==='error')error=event.message;
    if(event.type==='item.completed'&&event.item.type==='agent_message')finalResponse=event.item.text;
    console.log(JSON.stringify({event:event.type,...('item' in event?{itemType:event.item.type,...(event.item.type==='mcp_tool_call'?{tool:event.item.tool,status:event.item.status}:{})}:{})}));
  }
}catch(cause){error=cause instanceof Error?cause.message:String(cause);}
const after=snapshot();
await writeFile(resolve(out,'after.json'),JSON.stringify(after,null,2));
await writeFile(resolve(out,'final-response.txt'),finalResponse);
let archived=false,archiveError=null;
if(threadId){const result=await archivePluginSession(root,threadId,out);archived=result.archived;archiveError=result.error;}
const report={out,threadId,completed,error,usage,archived,archiveError,countsBefore:Object.fromEntries(Object.entries(before).map(([key,rows])=>[key,rows.length])),countsAfter:Object.fromEntries(Object.entries(after).map(([key,rows])=>[key,rows.length])),limits:'保存对象与正文需逐项对照原始工具事件；任务记录没有经过原来的 agent 命令，本实验不证明其长期任务跟踪。文学表现仍需人工阅读。'};
await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
if(!completed||error)process.exitCode=1;
