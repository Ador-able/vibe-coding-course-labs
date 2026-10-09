import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,runDir,versions,frozen,parseCandidate,json} from './comparison-common.mjs';
assert.ok(process.argv.length<=4,'用法：node prepare-comparison-page.mjs [结果目录] [页面目录]');
const pageDir=path.resolve(root,process.argv[3]??'public-my-comparison');
await fs.mkdir(pageDir);
for(const entry of await fs.readdir(path.join(root,'public'),{withFileTypes:true}))if(entry.isFile()&&/\.(html|css|js)$/.test(entry.name))await fs.copyFile(path.join(root,'public',entry.name),path.join(pageDir,entry.name));
const baseline=await frozen(),view={input:baseline.collection.records,versions:{},scope:'十份完整材料与两次原始结果；页面只读，不请求模型。'};
for(const version of versions){
 const directory=path.join(runDir,version),report=JSON.parse(await fs.readFile(path.join(directory,'report.json'),'utf8'));
 const raw=report.result?await fs.readFile(path.join(directory,'output.txt'),'utf8'):null;
 view.versions[version]={report,raw,candidate:raw?parseCandidate(raw).value:null,inspection:JSON.parse(await fs.readFile(path.join(directory,'inspection.json'),'utf8')),csvExport:JSON.parse(await fs.readFile(path.join(directory,'csv-export.json'),'utf8')),csvReadback:JSON.parse(await fs.readFile(path.join(directory,'csv-readback.json'),'utf8'))};
 if(view.versions[version].csvExport.state==='exported')await fs.copyFile(path.join(directory,'candidate.csv'),path.join(pageDir,version+'-candidate.csv'));
 await fs.copyFile(path.join(directory,'report.json'),path.join(pageDir,version+'-report.json'));
 if(raw!==null)await fs.copyFile(path.join(directory,'output.txt'),path.join(pageDir,version+'-output.txt'));
}
await fs.writeFile(path.join(pageDir,'comparison-state.json'),json(view),{flag:'wx'});console.log(JSON.stringify({versions,inputs:view.input.length,modelCalls:0}));
