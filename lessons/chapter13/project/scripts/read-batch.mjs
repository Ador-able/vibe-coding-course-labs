import fs from 'node:fs';
import path from 'node:path';
import { root, readJson, writeNew, sha256 } from '../src/files.mjs';
import { preserveOtherItems } from '../src/batch.mjs';

if (!process.argv[2] || !process.argv[3]) throw new Error('用法：node scripts/read-batch.mjs records/batch/本次目录 records/batch/本次目录/readback.json');
const directory = path.resolve(root, process.argv[2]), output = path.resolve(root, process.argv[3]);
const plan = readJson(path.join(directory, 'plan.json')); preserveOtherItems(directory, plan);
const items = plan.sourceIds.map(id => { const file = path.join(directory, 'items', `${id}.json`), raw = fs.readFileSync(file); return { sourceId: id, bytes: raw.length, sha256: sha256(raw), item: JSON.parse(raw.toString('utf8')) }; });
writeNew(output, { processId: process.pid, readAt: new Date().toISOString(), modelCalls: 0, items, otherItemsUnchanged: true, summaryAdopted: false,
  scope: '新的只读进程取得完整逐项状态；没有测试中途崩溃或自动恢复。' });
console.log(JSON.stringify({ output: path.relative(root, output), sources: items.length, modelCalls: 0, otherItemsUnchanged: true }));
