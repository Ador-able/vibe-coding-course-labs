import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {parseArgs} from 'node:util';

const {values}=parseArgs({options:{port:{type:'string',default:'4365'}}});
const practice=JSON.parse(readFileSync('practice.json','utf8'));
const child=spawn(process.execPath,['dist/prototype-server.js','--db',practice.database,'--work',practice.workId,'--port',values.port],{stdio:'inherit',windowsHide:true});
child.once('error',error=>{console.error(error.message);process.exitCode=1;});
child.once('exit',code=>{process.exitCode=code??1;});
