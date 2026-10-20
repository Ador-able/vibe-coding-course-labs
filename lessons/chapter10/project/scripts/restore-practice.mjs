import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {parseArgs} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Store} from '../dist/store.js';
import {tables,snapshotDatabase} from './practice-state.mjs';

const {values}=parseArgs({options:{snapshot:{type:'string',default:'课堂记录/凡人原文-20261015/01-最小Agent/158-模型完成.json'}}});
const bytes=readFileSync(values.snapshot),snapshot=JSON.parse(bytes),id=randomUUID(),database=`data/practice-${id}.sqlite`;
const store=new Store(database);
try{
  // 恢复完整业务记录，不把旧模型产物记作本次新生成。
  store.db.exec('BEGIN IMMEDIATE');
  for(const table of tables)for(const row of snapshot[table]){
    const columns=Object.keys(row);store.db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...Object.values(row));
  }
  store.db.exec('COMMIT');
}finally{store.close();}
assert.deepEqual(JSON.parse(JSON.stringify(snapshotDatabase(database))),snapshot);
const practice={id,database,workId:snapshot.works[0].id,restoredFrom:values.snapshot,sourceSha256:createHash('sha256').update(bytes).digest('hex'),restoredAt:new Date().toISOString(),scope:'完整恢复所选实录快照；未调用模型，未覆盖其他练习库。'};
writeFileSync('practice.json',JSON.stringify(practice,null,2)+'\n');mkdirSync(`runs/restore-${id}`,{recursive:true});writeFileSync(`runs/restore-${id}/report.json`,JSON.stringify({...practice,counts:Object.fromEntries(tables.map(table=>[table,snapshot[table].length])),byteObjectsVerified:true},null,2)+'\n');
console.log(JSON.stringify(practice));
