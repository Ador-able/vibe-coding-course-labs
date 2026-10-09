import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('.',import.meta.url)),lab=join(root,'lab');
const runId=process.argv[2];if(!runId)throw new Error('需要明确本轮 UUID。');
const run=JSON.parse(await readFile(join(lab,'runs/prototype-ui-'+runId+'/complete.json'),'utf8'));
const out=join(root,'实际证据','等待修复-'+runId);await mkdir(out,{recursive:true});const results=[];
for(const variant of run.variants){
 const output=join(out,'官方Client-'+variant.variant+'-完整读回.json');
 const stdout=execFileSync(process.execPath,['scripts/read-prototype-mcp.mjs','--db',variant.db,'--work',variant.workId,'--output',output],{cwd:lab,encoding:'utf8'});
 const report=JSON.parse(await readFile(output,'utf8'));
 const cli=execFileSync(process.execPath,['dist/cli.js','chapter','2','--db',variant.db,'--work',variant.workId],{cwd:lab,encoding:'utf8'});
 await writeFile(join(out,'CLI-'+variant.variant+'-第2章完整读回.json'),cli);
 assert.deepEqual(JSON.parse(cli),report.calls.at(-1).returned.structuredContent.result);
 const init=report.protocol.find(e=>e.direction==='send'&&e.message.method==='initialize');
 const returned=report.calls.at(-1).returned.structuredContent.result;
 results.push({variant:variant.variant,workId:variant.workId,stdout:stdout.trim(),protocolEvents:report.protocol.length,protocolVersion:init.message.params.protocolVersion,tables:Object.fromEntries(Object.entries(report.after).map(([k,v])=>[k,v.length])),revision:returned.revision,origin:returned.origin,status:returned.status,pidAfterClose:report.pidAfterClose,CLIEqualsMCP:true,beforeAfterLogicalEqual:true,modelCalled:false});
}
const time=execFileSync(process.execPath,['scripts/observe-reminder.mjs'],{cwd:lab,encoding:'utf8'});
await writeFile(join(out,'独立时间规则-完整输入输出.json'),time);
await writeFile(join(out,'三方案读回核对.json'),JSON.stringify({runId:run.runId,codeVersion:run.codeVersion,results,time:JSON.parse(time),limits:'HTTP/UI本轮由人工初始化与人工改稿。官方Client与CLI仅直接读回同一库；五表逻辑不变不代表整个数据库文件字节不变；时间实验是教师构造规则，未实际发送提醒。'},null,2));
console.log(JSON.stringify(results,null,2));
