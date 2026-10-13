import path from 'node:path';
import { createRun, finishRun, readJson, root } from '../src/files.mjs';
import { teaching } from '../src/teaching.mjs';
import { registerBatch } from '../src/batch.mjs';

const material = teaching(), index = readJson(path.join(root, 'records/index.json'));
const reportPath = process.argv[3] || index.groups.extraction;
if (!reportPath) throw new Error('请先保留本章完整整批抽取实录。');
const extraction = { ...readJson(path.join(root, reportPath)), reportPath };
if (extraction.group !== 'extraction') throw new Error('基线应为本章整批抽取记录。');
const run = createRun('batch', process.argv[2]);
const plan = registerBatch(run, extraction, material); finishRun(run);
console.log(JSON.stringify({ directory: path.relative(root, run.directory), sources: plan.sourceIds, repairIds: plan.repairIds, modelCalls: 0 }));
