import {Codex} from '@openai/codex-sdk';
import {randomUUID} from 'node:crypto';
import {appendFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {parseArgs,isDeepStrictEqual} from 'node:util';
import {Store} from './store.js';
import {workId,chapterNumber} from './schemas.js';

const {values}=parseArgs({options:{work:{type:'string',default:'clocktower'},chapter:{type:'string',default:'1'},'install-receipt':{type:'string',default:'data/插件安装回执.json'}}});
const root=process.cwd(),id=workId.parse(values.work),number=chapterNumber.parse(Number(values.chapter));
const binding=JSON.parse(await readFile('plugins/novel-practice/binding.json','utf8')) as {entry:string;database:string};
const store=new Store(binding.database);
const before={work:store.getWork(id),chapters:store.listChapters(id).map(item=>store.getChapter(id,item.number))};
const target=store.getChapter(id,number);
if(!target)throw new Error('插件只读检查需要已有的实际章节。');
const inspectionId=randomUUID(),runDir=resolve('runs',`plugin-${inspectionId}`);
await mkdir(runDir,{recursive:true});
let config:{model?:string;codexPathOverride?:string}={};
try{config=JSON.parse(await readFile('lab.config.json','utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
const codeVersion=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const installReceipt=JSON.parse(await readFile(values['install-receipt']!,'utf8')) as {pluginId:string;installedPath:string};
if(installReceipt.pluginId!=='novel-practice@novel-agent-lab')throw new Error('安装回执须属于本实验插件。');
const runtimeConfig={marketplaces:{'novel-agent-lab':{source:root,source_type:'local'}},plugins:{'novel-practice@novel-agent-lab':{enabled:true,mcp_servers:{novel_lab:{default_tools_approval_mode:'approve',enabled_tools:['read_work','list_chapters','read_chapter']}}}}};
const prompt=`请使用 $novel-practice:novel-chapter-task 处理一次只读检查，阅读它引用的状态与检查参考。通过该插件的小说教学 MCP 读取作品 ${id} 的当前要求、章节目录、第 ${number} 章及相关前文，说明实际保存状态与资料基线。文件读取仅用于宿主已装载并列出的 Skill 与其参考，不在仓库搜索替代 Skill；业务材料通过 MCP 取得。本次不生成或保存正文、不采用，也不调用其他插件。给出具体读取结果；对设定或文学表现的判断需要说明实际依据与未能确定的部分。`;
await writeFile(resolve(runDir,'input.json'),JSON.stringify({inspectionId,codeVersion,binding,installReceipt,workId:id,chapterNumber:number,runtimeConfig,configuredModel:config.model??null,prompt},null,2));
let completed=false,error:string|null=null,threadId:string|null=null,finalResponse='';
const toolCalls:Record<string,unknown>[]=[];
const completedCommands:string[]=[];
const commandOutputs:Array<{command:string;output:string}>=[];
console.log(JSON.stringify({inspectionId,runDir,state:'running'}));
try{
  const codex=new Codex({codexPathOverride:config.codexPathOverride,config:runtimeConfig});
  const thread=codex.startThread({workingDirectory:root,sandboxMode:'read-only',approvalPolicy:'never',webSearchMode:'disabled',model:config.model});
  const {events}=await thread.runStreamed(prompt);
  for await(const event of events){
    await appendFile(resolve(runDir,'events.jsonl'),JSON.stringify(event)+'\n');
    if(event.type==='thread.started')threadId=event.thread_id;
    if(event.type==='turn.completed')completed=true;
    if(event.type==='turn.failed')error=event.error.message;
    if(event.type==='error')error=event.message;
    if(event.type==='item.completed'&&event.item.type==='agent_message')finalResponse=event.item.text;
    if(event.type==='item.completed'&&event.item.type==='mcp_tool_call')toolCalls.push(event.item as unknown as Record<string,unknown>);
    if(event.type==='item.completed'&&event.item.type==='command_execution'&&event.item.exit_code===0){completedCommands.push(event.item.command);commandOutputs.push({command:event.item.command,output:event.item.aggregated_output});}
    console.log(JSON.stringify({event:event.type,...('item' in event?{itemType:event.item.type}:{}),...(event.type==='item.completed'&&event.item.type==='mcp_tool_call'?{server:event.item.server,tool:event.item.tool,status:event.item.status}:{})}));
  }
}catch(cause){error=cause instanceof Error?cause.message:String(cause);}
const successfulReads=toolCalls.filter(call=>call.status==='completed'&&!call.error);
const readResult=(name:string)=>{
  const call=successfulReads.find(call=>call.tool===name&&JSON.stringify(call.arguments).includes(id));
  return (call?.result as {structured_content?:{result:unknown}}|undefined)?.structured_content?.result;
};
const readWork=readResult('read_work'),readChapter=successfulReads.find(call=>call.tool==='read_chapter'&&(call.arguments as {chapterNumber?:number})?.chapterNumber===number);
const chapterResult=(readChapter?.result as {structured_content?:{result:{body?:string;revision?:number}}}|undefined)?.structured_content?.result;
const after={work:store.getWork(id),chapters:store.listChapters(id).map(item=>store.getChapter(id,item.number))};
const unchanged=isDeepStrictEqual(before,after);
const verifiedReads=isDeepStrictEqual(readWork,before.work)&&chapterResult?.body===target.body&&chapterResult.revision===target.revision;
const normalized=(path:string)=>path.replaceAll('\\','/').replace(/\/+/g,'/').toLowerCase();
const skillRoot=normalized(installReceipt.installedPath)+'/skills/novel-chapter-task/';
const text=(value:string)=>value.replaceAll('\r\n','\n').trim();
const skillText=text(await readFile('plugins/novel-practice/skills/novel-chapter-task/SKILL.md','utf8'));
const referenceText=text(await readFile('plugins/novel-practice/skills/novel-chapter-task/references/state-and-review.md','utf8'));
const verifiedSkillRead=commandOutputs.some(item=>normalized(item.command).includes(skillRoot+'skill.md')&&text(item.output).includes(skillText))&&commandOutputs.some(item=>normalized(item.command).includes(skillRoot+'references/state-and-review.md')&&text(item.output).includes(referenceText));
const passed=completed&&!error&&unchanged&&verifiedReads&&verifiedSkillRead;
let archived=false,archiveError:string|null=null;
if(threadId){
  try{
    // 这个检查不用于接续；归档本轮会话，让宿主释放它持有的运行资源。
    execFileSync(process.execPath,[resolve('scripts/codex-local.mjs'),'archive',threadId],{encoding:'utf8'});
    archived=true;
  }catch(cause){archiveError=cause instanceof Error?cause.message:String(cause);}
}
const report={inspectionId,codeVersion,threadId,completed,error,passed,unchanged,verifiedReads,verifiedSkillRead,archived,archiveError,toolCalls,completedCommands,finalResponse,limits:'本轮仅验证宿主通过插件实际读取业务资料并读取已安装 Skill；没有通过插件生成、保存或采用，也不证明资源或提示会自动交给模型。'};
await writeFile(resolve(runDir,'report.json'),JSON.stringify(report,null,2));
await writeFile(resolve(runDir,'final-response.txt'),finalResponse,'utf8');
store.close();
console.log(JSON.stringify({inspectionId,threadId,passed,unchanged,verifiedReads,verifiedSkillRead,runDir,error}));
if(!passed)process.exitCode=1;
