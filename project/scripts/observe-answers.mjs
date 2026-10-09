import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {generateText} from 'ai';
import {createOpenAICompatible} from '@ai-sdk/openai-compatible';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const comparison=JSON.parse(await fs.readFile(path.join(root,'public/chunks.json'),'utf8'));
const instructions=await fs.readFile(path.join(root,'inputs/问答规则.txt'),'utf8');
const question=await fs.readFile(path.join(root,'inputs/实际问答问题.txt'),'utf8');
const config={baseURL:process.env.API_BASE_URL,model:process.env.MODEL,apiKey:process.env.API_KEY};
if(!config.baseURL||!config.model||!config.apiKey)throw new Error('请从仓库根目录使用 scripts/run-lab.mjs，沿用请求观察室的模型设置');
const runId=randomUUID(),dir=path.join(root,'runs',runId);await fs.mkdir(dir,{recursive:true});
const records=[];
// 四次独立自然任务，不携带上一次回答；保持失败，不为取得理想答案重复。
for(const methodId of ['fixed80','structure80','overlap80x40','parent80']){
 const method=comparison.methods.find(x=>x.condition.id===methodId);
 const context=method.retrievals.find(x=>x.term==='卡住').context;
 const prompt=`资料：\n${context}\n\n问题：\n${question}`;
 const http=[];
 const provider=createOpenAICompatible({name:'compatible',baseURL:config.baseURL,apiKey:config.apiKey,fetch:async(url,init)=>{
  const item={url:String(url),requestBody:typeof init.body==='string'?init.body:null,startedAt:new Date().toISOString()};
  http.push(item);
  try{const response=await fetch(url,init);item.status=response.status;item.responseBody=await response.clone().text();item.finishedAt=new Date().toISOString();return response;}
  catch(error){item.error={name:error.name,message:error.message};item.finishedAt=new Date().toISOString();throw error;}
 }});
 const record={methodId,startedAt:new Date().toISOString(),sourceChunkRunId:comparison.runId,
  gitHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  model:config.model,baseURL:config.baseURL,instructions,prompt,context,question,
  options:{maxRetries:0,maxOutputTokens:1200,temperature:0,timeoutMs:60000},http};
 try{
  const result=await generateText({model:provider.chatModel(config.model),instructions,prompt,
   maxRetries:0,maxOutputTokens:1200,temperature:0,providerOptions:{compatible:{}},
   abortSignal:AbortSignal.timeout(60000)});
  record.result={text:result.text,usage:result.usage,totalUsage:result.totalUsage,finishReason:result.finishReason,
   rawFinishReason:result.rawFinishReason,response:{id:result.response.id,modelId:result.response.modelId,
    timestamp:result.response.timestamp,messages:result.response.messages,body:result.response.body},request:result.request};
 }catch(error){record.error={name:error.name,message:error.message,statusCode:error.statusCode,responseBody:error.responseBody};}
 record.finishedAt=new Date().toISOString();records.push(record);
 await fs.writeFile(path.join(dir,`${methodId}-完整请求与返回.json`),JSON.stringify(record,null,2)+'\n');
}
const output={runId,records,totalHttpCalls:records.reduce((n,x)=>n+x.http.length,0),newPdfReads:0};
await fs.writeFile(path.join(dir,'完整四次问答.json'),JSON.stringify(output,null,2)+'\n');
await fs.writeFile(path.join(root,'public/answers.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({runId,totalHttpCalls:output.totalHttpCalls,records:records.map(x=>({methodId:x.methodId,answer:x.result?.text,error:x.error,finishReason:x.result?.finishReason,usage:x.result?.usage}))}));
