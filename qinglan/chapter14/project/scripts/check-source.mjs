import { checkSource } from '../src/source.mjs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { root,load } from '../src/native-rest.mjs';

const source=await checkSource();const frozen=await load('source-version.json');
const scripts=frozen.files.filter(f=>f.path.endsWith('.mjs')||f.path.endsWith('.js'));
for(const file of scripts)execFileSync(process.execPath,['--check',path.join(root,file.path)]);
execFileSync(process.execPath,[path.join(root,'scripts/check-inputs.mjs')],{stdio:'inherit'});
console.log(JSON.stringify({source,scriptSyntaxChecked:scripts.length,modelRequests:0,businessRequests:0}));
