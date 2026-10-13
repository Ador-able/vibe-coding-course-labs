import {writeFileSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {sourceFiles,sha} from './source-files.mjs';

const files=sourceFiles(),input=readFileSync('inputs/输入冻结清单.json');
const sourceSha256=sha(Buffer.from(JSON.stringify(files)));
writeFileSync('source-version.json',JSON.stringify({sourceSha256,sourceVersion:sourceSha256,preparedFromGit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),practiceTag:'qinglan-ch15-practice-start',inputRegistrySha256:sha(input),files},null,2)+'\n');
console.log(JSON.stringify({sourceSha256,files:files.length,inputRegistrySha256:sha(input),modelRequests:0}));
