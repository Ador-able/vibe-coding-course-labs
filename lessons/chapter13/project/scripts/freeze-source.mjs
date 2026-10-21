import fs from 'node:fs';
import path from 'node:path';
import { root, sha256, writeJson, git } from '../src/files.mjs';
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const name = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) walk(name); else { const raw = fs.readFileSync(path.join(root, name)); files.push({ name, bytes: raw.length, sha256: sha256(raw) }); }
  }
}
for (const directory of ['src', 'scripts', 'test']) walk(directory);
for (const name of ['package.json', '../../../pnpm-lock.yaml', ]) { const raw = fs.readFileSync(path.join(root, name)); files.push({ name, bytes: raw.length, sha256: sha256(raw) }); }
for (const name of fs.readdirSync(path.join(root, 'public')).filter(name => /\.(html|js|css)$/.test(name))) { const raw = fs.readFileSync(path.join(root, 'public', name)); files.push({ name: `public/${name}`, bytes: raw.length, sha256: sha256(raw) }); }
files.sort((a, b) => a.name.localeCompare(b.name));
writeJson(path.join(root, 'source-version.json'), { sourceVersion: `sha256:${sha256(JSON.stringify(files))}`, gitBase: git(['rev-parse', 'HEAD']), frozenAt: new Date().toISOString(), files });
console.log(JSON.stringify({ sourceVersion: `sha256:${sha256(JSON.stringify(files))}`, files: files.length, modelCalls: 0 }));
