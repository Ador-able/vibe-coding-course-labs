import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {parseArgs} from 'node:util';

const {values}=parseArgs({options:{db:{type:'string',default:'data/opencode-plus.sqlite'},model:{type:'string',default:'courseModel/'+(process.env.MODEL??'')},'prompt-file':{type:'string',default:'seed/插件任务.txt'},session:{type:'string'}}});
const root=process.cwd(),database=resolve(values.db),out=resolve('runs',`opencode-${randomUUID()}`);
const snapshot=()=>{const db=new DatabaseSync(database,{readOnly:true});try{return Object.fromEntries(['works','work_versions','chapters','chapter_versions','tasks'].map(table=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()]));}finally{db.close();}};
const prompt=await readFile(values['prompt-file'],'utf8');
const before=snapshot();
await mkdir(out,{recursive:true});
await writeFile(resolve(out,'before.json'),JSON.stringify(before,null,2));
await writeFile(resolve(out,'request.json'),JSON.stringify({prompt,model:values.model,agent:'chapter-task',database,requestedSessionId:values.session??null,limits:'使用原生 OpenCode 命令执行，不实现模型或工具循环；接续输入是后续人工反馈，不代替首次条件或失败。'},null,2));
console.log(JSON.stringify({out,state:'running'}));
const sessionArgs=values.session?['--session',values.session]:[];
const child=spawn(process.execPath,[resolve('scripts/opencode-local.mjs'),'--db',values.db,'--out',out,'--prompt-file',values['prompt-file'],'--','run','--agent','chapter-task','--model',values.model,...sessionArgs,'--format','json','--thinking'],{cwd:root,windowsHide:true,stdio:['ignore','inherit','inherit']});
const exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
await writeFile(resolve(out,'after.json'),JSON.stringify(snapshot(),null,2));
const raw=await readFile(resolve(out,'stdout.txt'),'utf8');
const events=raw.split(/\r?\n/).filter(line=>line.trim().startsWith('{')).map(line=>JSON.parse(line));
await writeFile(resolve(out,'events.jsonl'),events.map(event=>JSON.stringify(event)).join('\n')+'\n');
const sessionId=events.find(event=>event.sessionID)?.sessionID??null;
let exportExitCode=null;
if(sessionId){
  const exporter=spawn(process.execPath,[resolve('scripts/opencode-local.mjs'),'--db',values.db,'--out',resolve(out,'session-export'),'--','export',sessionId],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const stdout=[],stderr=[];
  exporter.stdout.on('data',chunk=>stdout.push(chunk));exporter.stderr.on('data',chunk=>stderr.push(chunk));
  exportExitCode=await new Promise((resolve,reject)=>{exporter.on('error',reject);exporter.on('exit',resolve);});
  await writeFile(resolve(out,'session.json'),Buffer.concat(stdout));
  await writeFile(resolve(out,'session-export-stderr.txt'),Buffer.concat(stderr));
}
await writeFile(resolve(out,'report.json'),JSON.stringify({out,sessionId,exitCode,exportExitCode,eventCount:events.length,limits:'退出状态、方法读取与业务保存需要分别按完整事件、会话导出和五表对象核对。'},null,2));
console.log(JSON.stringify({out,sessionId,exitCode,exportExitCode,eventCount:events.length}));
process.exitCode=exitCode??1;
