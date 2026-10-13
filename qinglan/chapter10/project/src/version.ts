import {readFileSync} from 'node:fs';

// 交付包自带固定源码版本，运行实验不依赖 Git 仓库。
export function getCodeVersion():string{
  return JSON.parse(readFileSync(new URL('../source-version.json',import.meta.url),'utf8')).sourceVersion;
}
