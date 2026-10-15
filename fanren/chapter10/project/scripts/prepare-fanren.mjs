import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {Store} from '../dist/store.js';
import {workInput} from '../dist/schemas.js';
import {snapshotDatabase} from './practice-state.mjs';

// 每次建立独立空章库，人工资料不会被记成模型产物。
const seedPath='seed/凡人修仙传.json',bytes=readFileSync(seedPath),work=workInput.parse(JSON.parse(bytes));
const id=randomUUID(),database=`data/fanren-${id}.sqlite`,store=new Store(database);
try{store.init(work);}finally{store.close();}
const out=resolve('runs',`prepare-${id}`),before=snapshotDatabase(database);
mkdirSync(out,{recursive:true});
writeFileSync(resolve(out,'before.json'),JSON.stringify(before,null,2)+'\n');
const practice={id,database,workId:work.id,preparedFrom:seedPath,sourceSha256:createHash('sha256').update(bytes).digest('hex'),preparedAt:new Date().toISOString(),scope:'仅初始化凡人大纲与设定，目录为空；未调用模型。'};
writeFileSync('practice.json',JSON.stringify(practice,null,2)+'\n');
writeFileSync(resolve(out,'report.json'),JSON.stringify({...practice,out,modelTasks:0,counts:Object.fromEntries(Object.entries(before).map(([name,rows])=>[name,rows.length]))},null,2)+'\n');
console.log(JSON.stringify({...practice,out}));
