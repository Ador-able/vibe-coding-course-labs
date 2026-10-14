import {readFileSync} from 'node:fs';

// 固定版本随源码材料交付，不要求读者建立 Git 仓库。
export function getCodeVersion(){return JSON.parse(readFileSync(new URL('../source-version.json',import.meta.url),'utf8')).sourceVersion;}
