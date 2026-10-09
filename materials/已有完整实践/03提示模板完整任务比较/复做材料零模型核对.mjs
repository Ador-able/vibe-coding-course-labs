import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=dirname(fileURLToPath(import.meta.url)),project=join(root,'project'),fixed=JSON.parse(await readFile(join(root,'固定记录.json'),'utf8')),scope=JSON.parse(await readFile(join(root,'公共字段范围.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const [argv,expected] of [[['rev-parse','--show-toplevel'],project.replaceAll('\\','/')],[['rev-parse','HEAD'],fixed.end],[['status','--porcelain=v1','--untracked-files=all'],'']]){const p=spawnSync('git',argv,{cwd:project,encoding:'utf8',windowsHide:true});assert.equal(p.status,0);assert.equal(p.stdout.trim().replaceAll('\\','/'),expected);}
for(const f of fixed.gitBlobs){const b=await readFile(join(project,f.path));assert.equal(b.length,f.bytes);assert.equal(sha(b),f.sha256);}
for(const f of scope.preservedOriginals){const b=await readFile(join(root,f.path));assert.equal(b.length,f.bytes);assert.equal(sha(b),f.sha256);}
console.log(JSON.stringify({passed:true,sourceFiles:fixed.gitBlobs.length,preservedOriginals:scope.preservedOriginals.length,modelRequests:0,scope:'仅字节及独立Git根核对，不重新解释统计或重新生成。'}));
