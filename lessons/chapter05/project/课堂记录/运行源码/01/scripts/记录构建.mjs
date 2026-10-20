import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = `${directory}/${entry.name}`;
  return entry.isDirectory() ? walk(file) : [file];
});
const files = ['AGENTS.md', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json', '准备实验.mjs', ...walk('src'), ...walk('dist'), ...walk('seed'), ...walk('scripts')].sort();
const hashes = Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
const sha256 = createHash('sha256').update(JSON.stringify(hashes)).digest('hex');
writeFileSync('构建版本.json', JSON.stringify({ sha256, files: hashes }, null, 2) + '\n');
console.log(`构建版本：${sha256}`);
