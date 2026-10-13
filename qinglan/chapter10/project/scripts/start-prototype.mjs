import {spawn} from 'node:child_process';
import {parseArgs} from 'node:util';
import {currentPractice} from './practice-state.mjs';

const {values}=parseArgs({options:{port:{type:'string',default:'4340'}}}),practice=currentPractice();
const child=spawn(process.execPath,['dist/prototype-server.js','--db',practice.database,'--work',practice.workId,'--port',values.port],{stdio:'inherit',windowsHide:true});
child.once('exit',code=>{process.exitCode=code??1;});
