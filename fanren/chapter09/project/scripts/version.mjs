import {execFileSync} from 'node:child_process';

// 实际运行记录对应当前克隆仓库的提交。
export function getCodeVersion(){return execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();}
