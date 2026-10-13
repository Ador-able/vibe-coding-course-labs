import {getCodeVersion} from '../dist/version.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {DatabaseSync} from 'node:sqlite';
import {writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {workId,chapterNumber} from '../dist/schemas.js';
const {values}=parseArgs({options:{db:{type:'string'},work:{type:'string'},chapter:{type:'string',default:'2'},output:{type:'string'}}});
if(!values.db||!values.work||!values.output)throw new Error('需要 --db、--work 和 --output。');
const db=resolve(values.db),id=workId.parse(values.work),number=chapterNumber.parse(Number(values.chapter));
function snapshot(){const connection=new DatabaseSync(db,{readOnly:true});try{const result={};for(const table of ['works','work_versions','chapters','chapter_versions','tasks'])result[table]=connection.prepare('SELECT * FROM '+table+' ORDER BY rowid').all().map(r=>({...r,content:JSON.parse(r.content)}));return result;}finally{connection.close();}}
const before=snapshot(),protocol=[],calls=[];let stderr='';
const transport=new StdioClientTransport({command:process.execPath,args:[resolve('dist/mcp.js'),db],stderr:'pipe'});const client=new Client({name:'prototype-readback',version:'0.1.0'});
transport.stderr?.on('data',bytes=>{stderr+=bytes.toString('utf8');});const send=transport.send.bind(transport);transport.send=async(message,options)=>{protocol.push({direction:'send',message});return send(message,options);};transport.onmessage=message=>protocol.push({direction:'receive',message});
try{await client.connect(transport);const tools=await client.listTools();calls.push({request:{method:'tools/list'},returned:tools});for(const [name,args]of [['read_work',{workId:id}],['list_chapters',{workId:id}],['read_chapter',{workId:id,chapterNumber:number}]]){const returned=await client.callTool({name,arguments:args});calls.push({name,arguments:args,returned});assert.equal(returned.isError,undefined);}
}finally{await client.close();}
const after=snapshot();assert.deepEqual(after,before);assert.equal(transport.pid,null);
const chapter=after.chapters.find(c=>c.number===number).content;const returned=calls.at(-1).returned.structuredContent.result;assert.deepEqual(returned,chapter);
const report={codeVersion:getCodeVersion(),db,workId:id,chapterNumber:number,protocol,calls,before,after,stderr,pidAfterClose:transport.pid,modelCalled:false,limits:'官方 Client 直接读取 UI 人工保存的同一 Store。读回逐字相同且五表逻辑状态一致；没有模型生成、模型使用改稿、跨用户在线服务或写入中断撤回的验证。'};
await writeFile(resolve(values.output),JSON.stringify(report,null,2));console.log(JSON.stringify({output:resolve(values.output),chapterRevision:chapter.revision,origin:chapter.origin,toolCalls:3,modelCalled:false,pidAfterClose:transport.pid}));
