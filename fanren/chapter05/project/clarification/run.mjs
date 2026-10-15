import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {execFileSync} from 'node:child_process';
import {createOpenAICompatible} from '@ai-sdk/openai-compatible';
import {generateText} from 'ai';
import {publicFailure} from '../dist/approval-model.js';

const {values}=parseArgs({options:{case:{type:'string'},all:{type:'boolean',default:false},'max-output-tokens':{type:'string',default:'8192'}}});
if(values.all===Boolean(values.case))throw new Error('请选择 --case a|b|c|d 或教师用 --all。');
const cases=values.all?['a','b','c','d']:[values.case];
if(cases.some(c=>!['a','b','c','d'].includes(c)))throw new Error('条件为a、b、c、d。');
const maxOutputTokens=Number(values['max-output-tokens']);
if(!Number.isInteger(maxOutputTokens)||maxOutputTokens<1||maxOutputTokens>32000)throw new Error('输出上限应为1至32000的整数。');
for(const key of ['API_BASE_URL','API_KEY','MODEL'])if(!process.env[key]?.trim())throw new Error('请先在请求观察室保存模型设置，再通过共用入口启动。');
const source=await readFile('clarification/original.md','utf8');
const tasks=await Promise.all(cases.map(async key=>({case:key,text:await readFile(`clarification/tasks/${key}.md`,'utf8')})));
const instructions='请处理本次任务。完整原文和当前任务已直接提供在这次输入中，先核对这些材料。已有事实不请人重抄；目标、偏好或同级冲突尚未决定时，不替人决定，提出会改变产物的具体问题。只交短答、所要求的摘要或必要澄清，不写完整续章，不声称保存、采用或发布。';
const directory=resolve('clarification/records',new Date().toISOString().replaceAll(':','-')+'-'+randomUUID());
await mkdir(directory,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest={directory,codeCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceSha256:sha(source),conditions:tasks.map(t=>({case:t.case,taskSha256:sha(t.text)})),instructions,maxOutputTokens,provider:{baseUrl:process.env.API_BASE_URL,model:process.env.MODEL},notes:'独立无历史请求，各条件一次；原文与任务直接提供，不声称模型调用文件工具；不比较速度、可靠率或价格。'};
await writeFile(resolve(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
// 先冻结全部输入，再发出彼此独立的请求。
for(const t of tasks){await mkdir(resolve(directory,t.case));await writeFile(resolve(directory,t.case,'input.json'),JSON.stringify({instructions,prompt:`# 当前任务\n${t.text}\n# 《凡人修仙传》完整原文片段C03\n${source}`,sourceSha256:sha(source),taskSha256:sha(t.text)},null,2)+'\n');}
const results=await Promise.all(tasks.map(async t=>{
  const dir=resolve(directory,t.case),input=JSON.parse(await readFile(resolve(dir,'input.json'),'utf8'));
  let number=0;
  const provider=createOpenAICompatible({name:'compatible',baseURL:process.env.API_BASE_URL,apiKey:process.env.API_KEY,includeUsage:true,fetch:async(request,init)=>{
    const n=++number;
    await writeFile(resolve(dir,`request-${n}.json`),JSON.stringify({url:String(request),body:typeof init?.body==='string'?JSON.parse(init.body):null},null,2)+'\n');
    const response=await fetch(request,init);
    await writeFile(resolve(dir,`response-${n}.json`),JSON.stringify({status:response.status,body:await response.clone().json()},null,2)+'\n');
    return response;
  }});
  try{
    const result=await generateText({model:provider.chatModel(process.env.MODEL),instructions,prompt:input.prompt,maxOutputTokens,maxRetries:0,timeout:60000,providerOptions:{compatible:{stream:false}}});
    await writeFile(resolve(dir,'output.txt'),result.text);
    const report={case:t.case,state:result.finishReason==='length'||!result.text.trim()?'incomplete':'completed',requests:number,finishReason:result.finishReason,text:result.text,usage:result.usage};
    await writeFile(resolve(dir,'report.json'),JSON.stringify(report,null,2)+'\n');return report;
  }catch(error){const report={case:t.case,state:'failed',requests:number,error:publicFailure(error)};await writeFile(resolve(dir,'report.json'),JSON.stringify(report,null,2)+'\n');return report;}
}));
await writeFile(resolve(directory,'summary.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify({directory,results:results.map(({text,usage,...r})=>r)}));
if(results.some(r=>r.state!=='completed'))process.exitCode=1;
