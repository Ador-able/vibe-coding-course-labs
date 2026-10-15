import {execFileSync} from 'node:child_process';

// 课堂记录对应读者克隆仓库中的实际提交。
export function getCodeVersion():string{
  return execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();
}
