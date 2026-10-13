import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {sourceFiles,sha} from './source-files.mjs';

const source=JSON.parse(readFileSync('source-version.json','utf8')),files=sourceFiles();
assert.deepEqual(files,source.files);assert.equal(sha(Buffer.from(JSON.stringify(files))),source.sourceSha256);
const bytes=readFileSync('inputs/输入冻结清单.json');assert.equal(sha(bytes),source.inputRegistrySha256);
const registry=JSON.parse(bytes);
for(const file of registry.files){const input=readFileSync('inputs/'+file.path);assert.equal(input.length,file.bytes,file.path);assert.equal(sha(input),file.sha256,file.path);}
console.log(JSON.stringify({sourceSha256:source.sourceSha256,sourceFiles:files.length,inputs:registry.files.length,modelRequests:0}));
