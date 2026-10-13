import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {parseArgs} from 'node:util';
import {currentPractice,snapshotDatabase} from './practice-state.mjs';

const {values}=parseArgs({options:{out:{type:'string'}}});
if(!values.out)throw new Error('需要 --out 指定完整快照文件。');
const practice=currentPractice();mkdirSync(dirname(values.out),{recursive:true});
writeFileSync(values.out,JSON.stringify(snapshotDatabase(practice.database),null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({file:values.out,database:practice.database,scope:'当前五张业务表的完整记录；保存快照不等于人工采用。'}));
