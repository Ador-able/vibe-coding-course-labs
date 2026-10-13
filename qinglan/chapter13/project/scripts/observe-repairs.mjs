import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root, readJson, replaceJson, checkSource, readInputs, requireGitStart } from '../src/files.mjs';
import { teaching } from '../src/teaching.mjs';
import { modelRecorder } from '../src/model.mjs';
import { repairItems } from '../src/batch.mjs';

const directory = path.resolve(root, process.argv[2] || '');
if (!process.argv[2]) throw new Error('请提供 register-batch 已保存的本次状态目录。');
const material = teaching(), inputs = readInputs(), source = checkSource(), plan = readJson(path.join(directory, 'plan.json'));
const executionGitHead = requireGitStart();
assert.deepEqual(plan.repairIds, ['R01', 'R06']);
for (const id of plan.repairIds) {
  const item = readJson(path.join(directory, 'items', `${id}.json`)); assert.equal(item.attempts.length, 2, '同一状态不重复发送修复请求。');
  assert.equal(item.attempts[1].kind, 'teacher_candidate');
}
const reportFile = path.join(directory, 'repair-report.json');
fs.writeFileSync(reportFile, '{}', { flag: 'wx' });
const report = { group: 'repairs', startedAt: new Date().toISOString(), executionGitHead, sourceVersion: source.sourceVersion,
  inputFiles: inputs.registry.files, textTasks: 0, actualHttpRequests: 0, calls: [], outcome: 'started', sourceKind: 'teacher_candidate' };
const run = { directory, report, save: () => replaceJson(reportFile, report) }, answer = modelRecorder(run, 2);
const outcomes = await repairItems(run, material, plan, answer);
report.outcome = outcomes.some(result => result.status === 'rejected') ? 'failed' : 'returned'; report.finishedAt = new Date().toISOString(); run.save();
console.log(JSON.stringify({ actualHttpRequests: report.actualHttpRequests, outcomes: outcomes.map((result, i) => ({ sourceId: plan.repairIds[i], status: result.status })), otherItemsUnchanged: true, summaryAdopted: false }));
if (report.outcome === 'failed') process.exitCode = 1;
