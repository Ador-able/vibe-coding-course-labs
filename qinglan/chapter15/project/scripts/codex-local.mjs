import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';

const require=createRequire(import.meta.resolve('@openai/codex-sdk'));
export const officialEntry=require.resolve('@openai/codex/bin/codex.js');
if(process.argv[1]===import.meta.filename){
  const child=spawn(process.execPath,[officialEntry,...process.argv.slice(2)],{stdio:'inherit',windowsHide:true});
  child.once('error',error=>{console.error(error.message);process.exitCode=1;});
  child.once('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});
}
