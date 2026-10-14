import {spawn} from 'node:child_process';
import {currentPractice} from './practice-state.mjs';

const practice=currentPractice();
// 人工命令与页面始终使用当前练习库，不重复填写数据库和作品参数。
const child=spawn(process.execPath,['dist/cli.js',...process.argv.slice(2),'--db',practice.database,'--work',practice.workId],{stdio:'inherit',windowsHide:true});
child.once('exit',code=>{process.exitCode=code??1;});
