import {createHash,randomUUID} from 'node:crypto';
import {appendFile,mkdir,readFile,realpath,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {execFileSync} from 'node:child_process';

const root=dirname(fileURLToPath(import.meta.url));
const {values}=parseArgs({options:{'sdk-dir':{type:'string'},condition:{type:'string',default:'all'}}});

if(!['all','full','summary','tiered'].includes(values.condition))throw new Error('condition 应为 full、summary、tiered 或 all。');
const sdkDir=await realpath(values['sdk-dir']?resolve(values['sdk-dir']):join(dirname(fileURLToPath(import.meta.resolve('@openai/codex-sdk'))),'..'));
const sdkPackage=JSON.parse(await readFile(join(sdkDir,'package.json'),'utf8'));
if(sdkPackage.version!=='0.160.0')throw new Error('本实验核对的 SDK 版本为 0.160.0。');
const sdkEntry=join(sdkDir,'dist/index.js');
const sdkRequire=createRequire(pathToFileURL(sdkEntry));
const cliPackagePath=sdkRequire.resolve('@openai/codex/package.json');
const cliPackage=JSON.parse(await readFile(cliPackagePath,'utf8'));
const cliVersion=execFileSync(process.execPath,[join(dirname(cliPackagePath),'bin/codex.js'),'--version'],{encoding:'utf8'}).trim();
const {Codex}=await import(pathToFileURL(sdkEntry).href);
const manifest=JSON.parse(await readFile(join(root,'固定资料清单.json'),'utf8'));

async function hashes(){
  const result=[];
  for(const item of manifest.files){
    const bytes=await readFile(join(root,item.path));
    const sha256=createHash('sha256').update(bytes).digest('hex');
    if(sha256!==item.sha256)throw new Error(`固定材料字节不匹配：${item.path}`);
    result.push({path:item.path,bytes:bytes.length,sha256});
  }
  return result;
}
const common=`为第4章开头核对一句话：“林青取出丹方原本，准备向炼丹房的陈师兄请教。”判断哪些表述可以采用，哪些需要改动或向作者确认。只做用料核对，不写正文，不修改文件，不引入后续章节尚未采用的身份设想。

只根据本轮允许使用的资料判断，不补造事实。资料的采用状态以明确的人类决定为准，日期更新不代表已经采用。请说明每项判断的依据：实际得到的资料、版本和具体位置；不能确定的部分说明缺少什么。`;
const supplied=[];
for(const item of manifest.files.filter(item=>item.path.startsWith('材料包/'))){
  supplied.push(`## ${item.path}\n\n${await readFile(join(root,item.path),'utf8')}`);
}
const prompts={
  full:`${common}\n\n本轮允许的资料是下面直接提供的 8 个文件全文。不执行任何工具，不另外读取文件。请把它们记为“全文已提供”，不要伪称实际执行过读取命令。\n\n${supplied.join('\n\n')}`,
  summary:`${common}\n\n本轮只允许使用下面这份摘要。不执行任何工具，不读取任何原文或其他文件。不要根据本机存在文件猜测它们的内容。\n\n${await readFile(join(root,'对照摘要.md'),'utf8')}`,
  tiered:`${common}\n\n本轮允许只读文件读取。资料包的实际工作目录是：${join(root,'材料包')}。先打开该目录的“入口.md”，再依据当前任务按需打开相关规则、索引和原文。不要扫描或读取资料包以外的文件，不读取实验脚本、运行记录、清单或验收答案，不调用网页或其他插件。读取结果不足时说明缺口。最后同时说明实际已读的文件与位置，以及未读条目和未读原因。`
};
const runId=`${new Date().toISOString().replaceAll(':','-')}-${randomUUID()}`;
const runDir=join(root,'运行记录',runId);
await mkdir(runDir,{recursive:true});
const before=await hashes();
const report={runId,startedAt:new Date().toISOString(),sdkVersion:sdkPackage.version,cliPackageVersion:cliPackage.version,cliVersion,nodeVersion:process.version,model:'沿用现有默认，未在 SDK 设置 model',sdkEntry,sandboxMode:'read-only',webSearchMode:'disabled',inputFiles:before,conditions:[]};
console.log(JSON.stringify({runId,runDir,sdkVersion:sdkPackage.version,cliVersion}));

for(const condition of values.condition==='all'?['full','summary','tiered']:[values.condition]){
  const dir=join(runDir,condition);
  await mkdir(dir);
  const prompt=prompts[condition];
  await writeFile(join(dir,'prompt.txt'),prompt,'utf8');
  await writeFile(join(dir,'input.json'),JSON.stringify({condition,prompt,workingDirectory:join(root,'材料包'),sandboxMode:'read-only',webSearchMode:'disabled',model:null,inputFiles:before},null,2));
  // 各条件启动新 thread，记录使用公开事件，而非代理自报的读取情况。
  const thread=new Codex().startThread({workingDirectory:join(root,'材料包'),skipGitRepoCheck:true,sandboxMode:'read-only',approvalPolicy:'never',webSearchMode:'disabled'});
  let completed=false,error=null,usage=null,finalResponse='';
  const commands=[];
  console.log(JSON.stringify({condition,state:'running'}));
  try{
    const {events}=await thread.runStreamed(prompt);
    for await(const event of events){
      await appendFile(join(dir,'events.jsonl'),JSON.stringify(event)+'\n');
      if(event.type==='turn.completed'){completed=true;usage=event.usage;}
      if(event.type==='turn.failed')error=event.error.message;
      if(event.type==='error')error=event.message;
      if(event.type==='item.completed'&&event.item.type==='agent_message')finalResponse=event.item.text;
      if(event.type==='item.completed'&&event.item.type==='command_execution')commands.push(event.item);
      if(event.type==='item.completed'||event.type==='turn.completed'||event.type==='turn.failed')console.log(JSON.stringify({condition,event:event.type,itemType:event.item?.type}));
    }
  }catch(cause){error=cause instanceof Error?cause.message:String(cause);}
  const result={condition,threadId:thread.id,state:error?'failed':completed?'completed':'interrupted',error,usage,commands,finalResponse};
  await writeFile(join(dir,'output.txt'),finalResponse,'utf8');
  await writeFile(join(dir,'report.json'),JSON.stringify(result,null,2));
  report.conditions.push(result);
  console.log(JSON.stringify({condition,threadId:thread.id,state:result.state,commandCount:commands.length}));
}
report.finishedAt=new Date().toISOString();
report.afterFiles=await hashes();
await writeFile(join(runDir,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({runDir,states:report.conditions.map(item=>({condition:item.condition,state:item.state,commands:item.commands.length}))}));
if(report.conditions.some(item=>item.state!=='completed'))process.exitCode=1;
