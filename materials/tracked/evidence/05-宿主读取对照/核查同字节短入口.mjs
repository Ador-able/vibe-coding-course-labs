import {readFile,writeFile,appendFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';

// 保留失败输入与业务数据库，仅改变 SDK 的官方二进制入口。
const own='D:/Projects/Knowledge/.coursebook-work/localhost-9dfdb2d9c020/2/projects/vcm-06-03';
const root='D:/Projects/Knowledge/.coursebook-work/localhost-9dfdb2d9c020/2/runs/authoring-20261002/root-control-download/control-arrangement-lab';
const failed=resolve(root,'runs/control/2026-10-02T12-24-14.883Z-04dfb35c-41c6-48da-b23d-d48984376cc9/existing-agent');
const native='node_modules/.pnpm/@openai+codex@0.160.0-win32-x64/node_modules/@openai/codex/vendor/x86_64-pc-windows-msvc/bin';
const shortCli=resolve(own,native,'codex.exe');
const output=resolve(import.meta.dirname,'长路径启动对照',new Date().toISOString().replaceAll(':','-')+'-'+randomUUID());
await mkdir(output,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const binaries=[];
for(const base of [own,root])for(const name of ['codex.exe','codex-code-mode-host.exe']){
  const path=resolve(base,native,name);binaries.push({path,length:path.length,sha256:sha(await readFile(path))});
}
for(const name of ['codex.exe','codex-code-mode-host.exe']){
  if(new Set(binaries.filter(b=>b.path.endsWith(name)).map(b=>b.sha256)).size!==1)throw new Error('对照入口的程序字节不一致。');
}
const input=JSON.parse(await readFile(resolve(failed,'input.json'),'utf8'));
const baseline=JSON.parse(await readFile(resolve(failed,'baseline.json'),'utf8'));
const {Codex}=await import(pathToFileURL(resolve(root,'node_modules/@openai/codex-sdk/dist/index.js')).href);
const {Store}=await import(pathToFileURL(resolve(root,'dist/store.js')).href);
const snapshot=()=>{const store=new Store(input.db);try{return {work:store.getWork(input.workId),chapter:store.getChapter(input.workId,1)};}finally{store.close();}};
const before=snapshot();
const config={mcp_servers:{novel_lab:{command:process.execPath,args:[resolve(root,'dist/mcp.js'),input.db],cwd:root,enabled:true,required:true,enabled_tools:['read_work','read_chapter','list_chapters'],default_tools_approval_mode:'approve'}}};
await writeFile(resolve(output,'probe-input.json'),JSON.stringify({failedRecord:failed,originalCodeVersion:input.codeVersion,probeScriptSha256:sha(await readFile(import.meta.filename)),sdkModule:resolve(root,'node_modules/@openai/codex-sdk/dist/index.js'),sdkCliVersion:execFileSync(shortCli,['--version'],{encoding:'utf8'}).trim(),binaries,workingDirectory:root,codexPathOverride:shortCli,config,prompt:input.prompt,baseline,before,onlyConfiguredDifference:'使用字节相同的短路径 codex.exe；MCP 程序、数据库、工作目录、提示、只读与审批参数不变。新线程和运行时刻必然不同。'},null,2));
const codex=new Codex({codexPathOverride:shortCli,config});
const thread=codex.startThread({workingDirectory:root,sandboxMode:'read-only',approvalPolicy:'never',webSearchMode:'disabled'});
let error=null,usage=null,completed=false,finalResponse='',threadId=null;const items=[];
try{
  const {events}=await thread.runStreamed(input.prompt);
  for await(const event of events){
    await appendFile(resolve(output,'sdk-events.jsonl'),JSON.stringify(event)+'\n');
    if(event.type==='thread.started')threadId=event.thread_id;
    if(event.type==='turn.completed'){completed=true;usage=event.usage;}
    if(event.type==='turn.failed')error=event.error.message;
    if(event.type==='error')error=event.message;
    if(event.type==='item.completed'){items.push(event.item);if(event.item.type==='agent_message')finalResponse=event.item.text;}
  }
}catch(cause){error=String(cause);}
const after=snapshot();
const actual=items.filter(i=>i.type==='mcp_tool_call');
const work=actual.find(i=>i.server==='novel_lab'&&i.tool==='read_work'&&i.arguments?.workId===input.workId&&i.status==='completed');
const chapter=actual.find(i=>i.server==='novel_lab'&&i.tool==='read_chapter'&&i.arguments?.workId===input.workId&&i.arguments?.chapterNumber===1&&i.status==='completed');
const matches=Boolean(work&&chapter)&&JSON.stringify(work.result?.structured_content?.result)===JSON.stringify(baseline.work)&&JSON.stringify(chapter.result?.structured_content?.result)===JSON.stringify(baseline.chapter);
const report={threadId,completed,error,usage,actualTools:actual,workAndChapterMatchCompleteBaseline:matches,unchanged:JSON.stringify(before)===JSON.stringify(after),finalResponse,limits:'本次只验证相同字节短入口是否取得所需资料；时间和线程不同，不证明 Windows 根因，也不评价稳定速度或模型品质。'};
await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));
await writeFile(resolve(output,'final-response.txt'),finalResponse);
await writeFile(resolve(output,'after.json'),JSON.stringify(after,null,2));
console.log(JSON.stringify({output,threadId,completed,error,actualTools:actual.map(i=>({tool:i.tool,status:i.status})),workAndChapterMatchCompleteBaseline:matches,unchanged:report.unchanged}));
if(!completed||error||!matches||!report.unchanged)process.exitCode=1;
