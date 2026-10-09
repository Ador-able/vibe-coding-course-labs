import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root, sha256 } from '../src/materials.mjs';
import { loadUpdateMaterials } from '../src/update-materials.mjs';

assert(process.argv[2], '显式指定真实report.json，不自动选择通过记录');
const input = path.resolve(process.argv[2]), bytes = fs.readFileSync(input), report = JSON.parse(bytes);
const material = loadUpdateMaterials();
assert.deepEqual(report.inputFiles, material.inputFiles);
const directory = path.join(root, 'public/materials'); fs.mkdirSync(directory, { recursive: true });
const copies = [];
for (const row of [...material.before.filter(value => value.collection === 'memo'), material.action.replacement]) {
  const original = row.id === material.action.replacement.id
    ? path.join(root, 'inputs/update/02-费用便签-v2完整原文.txt')
    : path.join(root, 'inputs/retrieval', row.source.fileName);
  const originalBytes = fs.readFileSync(original);
  assert.equal(sha256(originalBytes), row.source.fileSha256);
  fs.writeFileSync(path.join(directory, row.source.fileName), originalBytes);
  copies.push({ name: row.source.fileName, bytes: originalBytes.length, sha256: sha256(originalBytes) });
}
fs.writeFileSync(path.join(root, 'public/answer-observation.json'), bytes);
assert.deepEqual(fs.readFileSync(path.join(root, 'public/answer-observation.json')), bytes);
process.stdout.write(JSON.stringify({ command: [process.execPath, ...process.argv.slice(1)], sourceReport: input,
  copiedReport: { bytes: bytes.length, sha256: sha256(bytes) }, copies, completed: report.completed,
  scope: '准备同一实际记录的只读静态页；此步骤没有模型/索引/排名/服务/浏览器执行。' }, null, 2) + '\n');
