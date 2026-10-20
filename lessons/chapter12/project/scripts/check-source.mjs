import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from '../src/materials.mjs';

function check(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) check(filename);
    else if (/\.(mjs|js)$/.test(filename)) {
      const result = spawnSync(process.execPath, ['--check', filename], { stdio: 'inherit', windowsHide: true });
      if (result.status !== 0) process.exit(result.status || 1);
    }
  }
}
for (const directory of ['src', 'scripts', 'public', 'test']) check(path.join(root, directory));
console.log('实验源码检查通过。');
