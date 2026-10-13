import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from '../src/files.mjs';
import { teaching } from '../src/teaching.mjs';
let count = 0;
function walk(directory) {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(name);
    else if (/\.(mjs|js)$/.test(name)) {
      const result = spawnSync(process.execPath, ['--check', name], { cwd: root, encoding: 'utf8', windowsHide: true });
      if (result.status !== 0) throw new Error(result.stderr); count++;
    }
  }
}
for (const directory of ['src', 'scripts', 'test']) walk(directory); walk('public');
const serverCheck = spawnSync(process.execPath, ['--check', 'server.mjs'], { cwd: root, encoding: 'utf8', windowsHide: true });
if (serverCheck.status !== 0) throw new Error(serverCheck.stderr); count++;
const material = teaching();
console.log(JSON.stringify({ checkedJavaScriptFiles: count, inputFiles: material.registry.files.length, sourceParagraphs: material.long.chapters.reduce((sum, item) => sum + item.paragraphs.length, 0), modelCalls: 0 }));
