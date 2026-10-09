import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const own=path.dirname(fileURLToPath(import.meta.url));
const lab=path.join(own,'lab');
const materials=path.join(own,'拟用完整材料');
const fixed='31209d553e6b95af2f1ac1055fc6de5d08e22a36';
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const git=(...args:string[])=>execFileSync('git',['-C',lab,...args]);
const gitText=(...args:string[])=>git(...args).toString('utf8').trim();

// 先确认独立检出；不借父目录的 Git 状态证明当前检查器版本。
if(await fs.realpath(gitText('rev-parse','--show-toplevel'))!==await fs.realpath(lab))throw new Error('Git 根目录不是本章独立 lab。');
const gitBefore={head:gitText('rev-parse','HEAD'),status:gitText('status','--porcelain=v1')};
if(gitBefore.head!==fixed||gitBefore.status)throw new Error('需要未改动的固定 31209 检出。');

const readFiles=[];
async function readJson(name:string){
  const bytes=await fs.readFile(path.join(materials,name));
  readFiles.push({file:name,bytes:bytes.length,sha256:sha(bytes)});
  return JSON.parse(bytes.toString('utf8'));
}
const history=await readJson('01-历史六次完整请求与返回.json');
const sdkPage=await readJson('04-既有SDK严格模式完整页面记录.json');
const classroom=await readJson('05-课堂接收样例-完整输入.json');
const novel=await readJson('07-小说迁移-完整教学任务与两个返回.json');
const sdkMessage=JSON.parse(sdkPage[3]);
const sdkMetadata=JSON.parse(sdkPage[4]);

type Input={id:string;kind:string;message:unknown;finishReason:string|null|undefined;material:string;source:unknown;originalRecord?:unknown;teacherExpectation?:unknown};
const inputs:Input[]=[
  ...history.attempts.map((entry:any,index:number)=>({
    id:`H${index+1}`,kind:'历史真实模型响应，当前只重新调用检查器',
    message:entry.run.request.responseMessage,finishReason:entry.run.request.finishReason,material:entry.material,
    source:{file:'01-历史六次完整请求与返回.json',attemptIndex:index,historicalRunId:entry.run.id,executionCommit:'f659ab30306cefb8927b0034412bcc60c4ea74e8'},
    originalRecord:entry,
  })),
  {
    id:'S1',kind:'既有 SDK 一次严格模式响应，与旧六次分列',
    message:sdkMessage,finishReason:sdkMetadata.finishReason,material:sdkPage[0],
    source:{file:'04-既有SDK严格模式完整页面记录.json',indices:{material:0,message:3,metadata:4,teacherCounterexample:6},executionCommit:'bab23880691fb730a24f3b1772da81a29fa373e9',historicalRunId:null,note:'完整页面的索引6是人工反例，不计入此模型响应；原记录没有模型请求UUID'},
    originalRecord:sdkPage,
  },
  ...classroom.cases.map((entry:any)=>({
    id:entry.id,kind:'教师构造接收输入，不是服务实测响应',
    message:entry.message,finishReason:entry.finishReason,material:entry.material,
    source:{file:'05-课堂接收样例-完整输入.json',label:entry.label},
    teacherExpectation:entry.expected,
  })),
  ...novel.returns.map((entry:any)=>({
    id:entry.id,kind:'教师构造小说返回，未向模型发送或保存',
    message:entry.message,finishReason:novel.finishReason,material:novel.input.material,
    source:{file:'07-小说迁移-完整教学任务与两个返回.json',label:entry.label},
    teacherExpectation:entry.humanJudgment,
  })),
];

const checkerBytes=await fs.readFile(path.join(lab,'src/structured/inspect.ts'));
const checkerBlob=git('show',`${fixed}:src/structured/inspect.ts`);
const schemaBytes=await fs.readFile(path.join(lab,'src/structured/schema.ts'));
const schemaBlob=git('show',`${fixed}:src/structured/schema.ts`);
const id=randomUUID();
const output=path.join(own,'零模型观察',id);
await fs.mkdir(output,{recursive:true});

const report={
  kind:'本章零模型检查器观察；UUID 是观察编号，不是模型请求或 Harness 会话',
  observationId:id,startedAt:new Date().toISOString(),finishedAt:null as string|null,
  state:'running',node:process.version,gitBefore,gitAfter:null as typeof gitBefore|null,
  modelCalls:0,businessWrites:0,inputFiles:readFiles,
  checker:{file:'src/structured/inspect.ts',checkoutSha256:sha(checkerBytes),gitBlobSha256:sha(checkerBlob)},
  schema:{file:'src/structured/schema.ts',checkoutSha256:sha(schemaBytes),gitBlobSha256:sha(schemaBlob)},
  historicalSdkPage:sdkPage,
  novelTeacherTask:novel.input,
  observations:[] as {input:Input;inspection:unknown;error:unknown}[],
  interpretation:'inspection 是现有程序输出；teacherExpectation 仅保留教师先前预期，不自动认证语义、采用或保存。',
};

// 仅调用已经存在的检查函数；没有请求客户端、服务器或模型循环。
const {inspectResponse}=await import('./lab/src/structured/inspect.ts');
for(const input of inputs){
  try{
    report.observations.push({input,inspection:inspectResponse(input.message,input.finishReason,input.material),error:null});
  }catch(error){
    report.observations.push({input,inspection:null,error:{name:error instanceof Error?error.name:'UnknownError',message:error instanceof Error?error.message:String(error)}});
  }
}
report.gitAfter={head:gitText('rev-parse','HEAD'),status:gitText('status','--porcelain=v1')};
report.finishedAt=new Date().toISOString();
report.state=report.observations.some(entry=>entry.error)||report.gitAfter.head!==fixed||report.gitAfter.status?'failed':'completed';
await fs.writeFile(path.join(output,'完整输入与程序返回.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({observationId:id,state:report.state,file:path.join(output,'完整输入与程序返回.json'),callsToExistingChecker:report.observations.length,modelCalls:0,businessWrites:0,gitAfter:report.gitAfter},null,2));
if(report.state==='failed')process.exitCode=1;
