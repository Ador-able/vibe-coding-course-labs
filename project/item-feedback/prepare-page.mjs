import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {root,readJson,ids,json} from './records.mjs';

if(process.argv.length>4)throw new Error('用法：node prepare-page.mjs runs/read-01.json public/state.json');
const receipt=resolve(root,process.argv[2]??'runs/read-01.json'),output=resolve(root,process.argv[3]??'public/state.json');
const result=await readJson(receipt);assert.deepEqual(result.sourceIds,ids);assert.equal(result.stateBytesUnchanged,true);
const feedback={};for(const id of ['R01','R06'])feedback[id]=await readFile(join(root,'prompts/repair',`教师反馈-${id}.txt`),'utf8');
await writeFile(output,json({readAt:result.readAt,sourceIds:ids,state:result.state,files:result.files,feedback,scope:result.scope}),{flag:'wx'});
console.log(json({output,sourceIds:ids,modelRequests:0,scope:'由完整纯读取回执制作静态浏览数据；未打开浏览器。'}));
