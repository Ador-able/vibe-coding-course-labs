import fs from 'node:fs';
import path from 'node:path';
import { root, sha256, writeJson, git } from '../src/materials.mjs';

const files = [];
function collect(directory) {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.posix.join(directory.replaceAll('\\', '/'), entry.name);
    if (entry.isDirectory()) collect(relative);
    else { const bytes = fs.readFileSync(path.join(root, relative)); files.push({ name: relative, bytes: bytes.length, sha256: sha256(bytes) }); }
  }
}
for (const directory of ['src', 'scripts', 'test']) collect(directory);
for (const name of ['package.json', 'pnpm-lock.yaml', 'requirements.txt', 'server.mjs', '启动实验.cmd']) {
  const bytes = fs.readFileSync(path.join(root, name)); files.push({ name, bytes: bytes.length, sha256: sha256(bytes) });
}
for (const entry of fs.readdirSync(path.join(root, 'public'))) {
  if (/\.(html|css|js)$/.test(entry)) { const bytes = fs.readFileSync(path.join(root, 'public', entry)); files.push({ name: `public/${entry}`, bytes: bytes.length, sha256: sha256(bytes) }); }
}
files.sort((a, b) => a.name.localeCompare(b.name));
const sourceVersion = `sha256:${sha256(JSON.stringify(files))}`;
writeJson(path.join(root, 'source-version.json'), { sourceVersion, gitHead: git(['rev-parse', 'HEAD']), frozenAt: new Date().toISOString(), files });
console.log(JSON.stringify({ sourceVersion, files: files.length }));
