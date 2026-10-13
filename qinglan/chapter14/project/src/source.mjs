import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { root, sha, load } from './native-rest.mjs';

export async function checkSource() {
  const source=await load('source-version.json');
  for(const file of source.files){const raw=await fs.readFile(path.join(root,file.path));if(raw.length!==file.bytes||sha(raw)!==file.sha256)throw new Error('冻结源码或材料有变化：'+file.path+'。先固定新的实际起点。');}
  return {sourceSha256:source.sourceSha256,gitCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim(),frozenInputSha256:source.frozenInputSha256};
}
