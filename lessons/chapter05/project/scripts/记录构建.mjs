import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = `${directory}/${entry.name}`;
  return entry.isDirectory() ? walk(file) : [file];
});
const versionFile = 'dist/build-version.json';
// 构建清单记录产物，不参与自身哈希。
const files = ['AGENTS.md', 'package.json', '../../../pnpm-lock.yaml', 'tsconfig.json', '准备实验.mjs', ...walk('src'), ...walk('dist').filter(file => file !== versionFile), ...walk('seed'), ...walk('materials'), ...walk('scripts')].sort();
const hashes = Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
const sha256 = createHash('sha256').update(JSON.stringify(hashes)).digest('hex');
writeFileSync(versionFile, JSON.stringify({ sha256, files: hashes }, null, 2) + '\n');
console.log(`构建版本：${sha256}`);
