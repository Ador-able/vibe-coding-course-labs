import {DatabaseSync} from 'node:sqlite';
import {randomUUID, createHash} from 'node:crypto';
import {appendFileSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {Store} from '../dist/store.js';

const runId=randomUUID();
const directory=resolve('runs/mcp-connection',runId);
mkdirSync(directory,{recursive:true});
const database=resolve(directory,'teaching.sqlite');
const save=(name,value)=>writeFileSync(resolve(directory,name),JSON.stringify(value,null,2)+'\n','utf8');
let sequence=0;
const record=(kind,data={})=>appendFileSync(resolve(directory,'protocol.jsonl'),JSON.stringify({sequence:++sequence,at:new Date().toISOString(),kind,...data})+'\n','utf8');
const work={
  id:'bridge-clocktower',title:'钟楼门前',purpose:'人工教学资料，用于分辨连接、目录与正文读取。',
  requirements:['只检查真实保存状态；不生成、保存或采用正文。'],
  facts:['林澈没有钟楼钥匙，必须请周伯开门。','钟楼的钟昨夜停了。'],
  outline:[
    {number:1,titleHint:'门前',goal:'林澈在门外等待周伯。'},
    {number:2,titleHint:'检查',goal:'开门以后检查停钟；此章尚未写。'}
  ]
};
const firstChapter={workId:work.id,chapterNumber:1,expectedWorkRevision:1,expectedChapterRevision:0,expectedPreviousRevisions:[],title:'门前',body:'林澈站在钟楼门外，把工具箱放在脚边。昨夜停下的钟没有再响，他伸手推了一次门，门板纹丝不动。\n\n周伯提着钥匙从街角走来。林澈收回手，说明师父让他来查看停钟。周伯点了点头，把钥匙插进锁孔。'};
// 准备阶段写入人工材料；开始观察以后只调用读取能力。
const preparation=new Store(database);
try{preparation.init(work);preparation.saveDraft(firstChapter,'human');}
finally{preparation.close();}

// 从数据库独立读回完整业务表，不拿 MCP 返回充当真实状态。
function snapshot(){
  const db=new DatabaseSync(database,{readOnly:true});
  try{
    return Object.fromEntries([
      ['works','id'],['work_versions','work_id,revision'],['chapters','work_id,number'],
      ['chapter_versions','work_id,number,revision'],['tasks','id']
    ].map(([table,order])=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all().map(row=>({...row,content:JSON.parse(row.content)}))]));
  }finally{db.close();}
}
const before=snapshot();
save('business-before.json',before);
const sdkPackage=JSON.parse(readFileSync(resolve('node_modules/@modelcontextprotocol/sdk/package.json'),'utf8'));
const serverEntry=resolve('dist/mcp.js');
save('input.json',{runId,codeVersion:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,mcpSdk:sdkPackage.version,clientName:'mcp-connection-observer',serverEntry,serverEntrySha256:createHash('sha256').update(readFileSync(serverEntry)).digest('hex'),database,fixture:{origin:'human',work,firstChapter},observation:'官方 Client 的公开解析消息，不调用模型，不改变全局宿主配置。'});

const client=new Client({name:'mcp-connection-observer',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[serverEntry,database],cwd:process.cwd(),stderr:'pipe'});
const send=transport.send.bind(transport);
transport.send=async message=>{record('client-message',{message});return send(message);};
transport.onmessage=message=>record('server-message',{message});
transport.onerror=error=>record('transport-error',{message:error.message});
transport.onclose=()=>record('transport-closed');
transport.stderr.on('data',chunk=>appendFileSync(resolve(directory,'server-stderr.txt'),chunk));
const results=[];
let connected=false,tools=null,failure=null,serverPid=null;
try{
  record('connect-start');
  await client.connect(transport);
  connected=true;serverPid=transport.pid;
  record('connect-returned',{pid:serverPid,server:client.getServerVersion(),capabilities:client.getServerCapabilities(),instructions:client.getInstructions()});
  tools=await client.listTools();
  save('tools.json',tools);
  for(const request of [
    {name:'read_work',arguments:{workId:work.id}},
    {name:'list_chapters',arguments:{workId:work.id}},
    {name:'read_chapter',arguments:{workId:work.id,chapterNumber:1}},
    {name:'read_chapter',arguments:{workId:work.id,chapterNumber:2}},
    {name:'read_chapter',arguments:{workId:'missing-work',chapterNumber:1}}
  ]){
    const response=await client.callTool(request);
    results.push({request,response});
    save('calls.json',results);
  }
}catch(error){
  failure={name:error.name,message:error.message};
  record('observer-error',failure);
}finally{
  record('close-start');
  try{await client.close();record('close-returned',{pid:transport.pid});}
  catch(error){failure??={name:error.name,message:error.message};record('close-error',{message:error.message});}
}
const after=snapshot();
save('business-after.json',after);
let verification=null;
try{
  assert.equal(failure,null);
  assert.equal(results.length,5);
  assert.deepEqual(after,before);
  const currentWork=after.works.find(row=>row.id===work.id);
  const chapter=after.chapters.find(row=>row.work_id===work.id&&row.number===1);
  assert.deepEqual(results[0].response.structuredContent.result,{...currentWork.content,revision:currentWork.revision});
  assert.deepEqual(results[2].response.structuredContent.result,chapter.content);
  assert.equal(results[3].response.structuredContent.result,null);
  assert.notEqual(results[3].response.isError,true);
  assert.equal(results[4].response.isError,true);
  assert.equal(JSON.parse(results[4].response.content[0].text).code,'WORK_NOT_FOUND');
  assert.equal(transport.pid,null);
  verification={passed:true,businessUnchanged:true,chapterMatched:true,unsavedChapter:'result:null',missingWork:'isError:true / WORK_NOT_FOUND'};
}catch(error){verification={passed:false,message:error.message};}
const protocol=readFileSync(resolve(directory,'protocol.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
const initialize=protocol.find(event=>event.kind==='server-message'&&event.message.result?.protocolVersion);
const report={runId,directory,connected,serverPid,protocolVersion:initialize?.message.result.protocolVersion??null,declaredTools:tools?.tools.map(tool=>tool.name)??[],callCount:results.length,failure,verification,limits:'仅验证官方 Client 的连接、发现、五次读取与此次正常关闭；不验证模型使用、远程 HTTP、超时、用户取消或子进程崩溃。业务状态比较不等于数据库文件字节不变。'};
save('report.json',report);
console.log(JSON.stringify(report,null,2));
if(!verification.passed)process.exitCode=1;
