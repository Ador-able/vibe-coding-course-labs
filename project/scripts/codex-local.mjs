import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';

// 使用 SDK 已有依赖的官方 CLI 入口，避免命令落到全局的另一版本。
const require=createRequire(import.meta.resolve('@openai/codex-sdk'));
const entry=require.resolve('@openai/codex/bin/codex.js');
const child=spawn(process.execPath,[entry,...process.argv.slice(2)],{stdio:'inherit'});
child.once('error',error=>{console.error(error.message);process.exitCode=1;});
child.once('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});
