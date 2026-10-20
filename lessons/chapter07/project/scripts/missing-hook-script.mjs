import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

// 包装器只记录宿主触发后调用缺失脚本的真实结果，并把退出码交回宿主。
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const input=JSON.parse(raw);
const directory=resolve('runs/hooks',`missing-${input.tool_use_id}`);
await mkdir(directory,{recursive:true});
await writeFile(resolve(directory,'stdin.json'),raw);
const missing=resolve('scripts/not-installed-check.mjs');
const child=spawn(process.execPath,[missing],{stdio:['pipe','pipe','pipe'],windowsHide:true});
const stdout=[],stderr=[];
child.stdout.on('data',chunk=>stdout.push(chunk));
child.stderr.on('data',chunk=>stderr.push(chunk));
child.stdin.on('error',error=>{if(error.code!=='EPIPE')throw error;});
child.stdin.end(raw);
const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
const out=Buffer.concat(stdout),err=Buffer.concat(stderr);
await writeFile(resolve(directory,'stdout.txt'),out);
await writeFile(resolve(directory,'stderr.txt'),err);
await writeFile(resolve(directory,'进程结果.json'),JSON.stringify({exitCode,missingScript:missing,toolUseId:input.tool_use_id},null,2));
process.stdout.write(out);process.stderr.write(err);process.exitCode=exitCode??1;
