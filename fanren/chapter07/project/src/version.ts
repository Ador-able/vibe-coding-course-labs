import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Git提交标识本轮实验源码。
export function getCodeVersion():string{
  return execFileSync('git',['rev-parse','HEAD'],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',windowsHide:true}).trim();
}
