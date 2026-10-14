import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const input=JSON.parse(readFileSync('materials/historical/保存等待历史行为.json','utf8')),current=readFileSync('prototype/app.js');
assert.equal(sha(current),input.currentCorrectSha256,'先在自己的独立Git分支取得本章正确起点；不覆盖其他版本或已有改动。');
const restored=current.toString('utf8').replace(input.correctBusy,input.oldBusy).replace("$('draft-title').disabled=busy;$('draft-body').disabled=busy;","$('draft-title').disabled=false;$('draft-body').disabled=false;");
assert.equal(sha(Buffer.from(restored)),input.restoredSha256);
writeFileSync('prototype/app.js',restored);
console.log(JSON.stringify({restoredSha256:input.restoredSha256,scope:input.scope,modelRequests:0}));
