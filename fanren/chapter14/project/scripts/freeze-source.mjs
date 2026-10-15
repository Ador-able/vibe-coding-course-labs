import fs from 'node:fs/promises';
import path from 'node:path';
import { root,sha,save } from '../src/native-rest.mjs';

const names=['package.json','pnpm-lock.yaml','server.mjs','.gitignore','.gitattributes','启动实验.cmd','README.md'];
async function walk(folder){for(const entry of await fs.readdir(path.join(root,folder),{withFileTypes:true})){const name=folder+'/'+entry.name;if(entry.isDirectory())await walk(name);else names.push(name);}}
for(const folder of ['src','scripts','test','public','inputs','workflows','files','materials'])await walk(folder);
const files=[];for(const name of names.sort()){const raw=await fs.readFile(path.join(root,name));files.push({path:name,bytes:raw.length,sha256:sha(raw)});}
const sourceSha256=sha(JSON.stringify(files));
await save('source-version.json',{kind:'actual-executable-source-and-complete-inputs',sourceSha256,frozenInputSha256:sha(await fs.readFile(path.join(root,'inputs/输入冻结清单.json'))),files,gitStart:'按各实际采集source.json的gitCommit与本清单逐项SHA回查。'});
console.log(JSON.stringify({sourceSha256,files:files.length,modelRequests:0,businessRequests:0}));
