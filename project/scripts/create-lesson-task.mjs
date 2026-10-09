import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Store} from '../dist/store.js';
import {workId,chapterNumber} from '../dist/schemas.js';

const {values}=parseArgs({options:{db:{type:'string'},id:{type:'string'},work:{type:'string'},chapter:{type:'string'}}});
if(!values.db||!values.id||!values.work||!values.chapter)throw new Error('需要本次独立数据库和确切任务、作品、章号。');
const store=new Store(resolve(values.db));
try{
  const input={id:values.id,workId:workId.parse(values.work),chapterNumber:chapterNumber.parse(Number(values.chapter)),codeVersion:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()};
  console.log(JSON.stringify({input,result:store.createTask(input)},null,2));
}finally{store.close();}
