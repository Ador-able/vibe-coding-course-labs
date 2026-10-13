import {readdirSync,readFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';

export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function sourceFiles(){
  const root=resolve('.'),files=[];
  const visit=path=>{for(const item of readdirSync(path,{withFileTypes:true})){const file=resolve(path,item.name);item.isDirectory()?visit(file):files.push(relative(root,file).replaceAll('\\','/'));}};
  for(const dir of ['src','prototype','scripts','docs','config','materials'])visit(resolve(dir));
  files.push('package.json','pnpm-lock.yaml','tsconfig.json','AGENTS.md','README.md','.gitignore');
  return files.sort().map(path=>{const bytes=readFileSync(path);return{path,bytes:bytes.length,sha256:sha(bytes)};});
}
