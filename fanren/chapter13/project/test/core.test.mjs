import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { teaching } from '../src/teaching.mjs';
import { checkExtraction } from '../src/checks.mjs';
import { root, json } from '../src/files.mjs';
import { checkItem, registerBatch, preserveOtherItems, updateItem, repairItems } from '../src/batch.mjs';
import { generateText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const material = teaching();
const rows = material.reference.records.map(row => ({ ...row, evidence: Object.fromEntries(material.reference.fields.slice(1).map(field => [field, ['budgetMinutes', 'duplicateOf'].includes(field) && row[field] === null ? null : material.logs.records.find(item => item.id === row.sourceId).text])) }));
test('统计资格保留实际未知、零和明确重复，不使用缺口日志补分子', () => {
  const candidate = { records: rows.slice(0, 8), summary: { ...structuredClone(material.reference.summaries.eight), limits: material.reference.limits } };
  assert.equal(checkExtraction(json(candidate), material.logs, material.reference, 'extraction').mechanicalState, 'passed');
  candidate.summary.ratioSourceIds.push('R04'); candidate.summary.sumPassed += 3;
  const check = checkExtraction(json(candidate), material.logs, material.reference, 'extraction');
  assert.ok(check.summaryIssues.some(item => item.field === 'ratioSourceIds')); assert.ok(check.summaryIssues.some(item => item.field === 'sumPassed'));
  const wrongIdentity = { ...rows[0], sourceId: 'R06' };
  assert.equal(checkItem(json(wrongIdentity), 'R01', material).mechanicalState, 'failed');
});
test('教师候选与真实原项分别保存，修改两项不改变另外六项原字节', () => {
  fs.mkdirSync(path.join(root, '.tmp'), { recursive: true }); const directory = fs.mkdtempSync(path.join(root, '.tmp/batch-'));
  const run = { directory }, extraction = { reportPath: 'teacher-controlled-test-only', calls: [{ status: 'returned', result: { text: json({ records: rows.slice(0, 8), summary: material.reference.summaries.eight }) } }] };
  const plan = registerBatch(run, extraction, material);
  const item = JSON.parse(fs.readFileSync(path.join(directory, 'items/R01.json'), 'utf8'));
  assert.deepEqual(item.attempts.map(attempt => attempt.kind), ['cloud', 'teacher_candidate']);
  updateItem(directory, 'R01', item => item.attempts.push({ kind: 'teacher-controlled-test-only' })); preserveOtherItems(directory, plan);
  fs.writeFileSync(path.join(directory, 'items/R03.json'), '{}'); assert.throws(() => preserveOtherItems(directory, plan));
});
test('CSV由独立Python进程完整往返引号、逗号、换行、零和null', () => {
  fs.mkdirSync(path.join(root, '.tmp'), { recursive: true }); const directory = fs.mkdtempSync(path.join(root, '.tmp/csv-'));
  const input = path.join(directory, 'candidate.json'), output = path.join(directory, 'csv'); fs.writeFileSync(input, json({ records: rows, summary: material.reference.summaries.ten }));
  const python = process.env.LAB_PYTHON || 'python';
  for (const mode of ['export', 'readback']) { const result = spawnSync(python, ['-X', 'utf8', 'scripts/csv-records.py', mode, path.relative(root, input), path.relative(root, output)], { cwd: root, encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 0, result.stderr || result.stdout); }
  const receipt = JSON.parse(fs.readFileSync(path.join(output, 'csv-readback.json'), 'utf8')); assert.equal(receipt.rows, 10); assert.equal(receipt.modelCalls, 0);
  assert.equal(receipt.restoredRows[0].title, rows[0].title); assert.equal(receipt.restoredRows[4].actualMinutes, 0); assert.equal(receipt.restoredRows[5].actualMinutes, null);
});
test('官方Mock调用真实逐项函数：一项失败不丢另一项，六项原字节保留', async () => {
  fs.mkdirSync(path.join(root, '.tmp'), { recursive: true }); const directory = fs.mkdtempSync(path.join(root, '.tmp/mock-'));
  const run = { directory }, plan = registerBatch(run, { reportPath: 'official-mock-test-only', calls: [{ status: 'returned', result: { text: json({ records: rows.slice(0, 8), summary: material.reference.summaries.eight }) } }] }, material);
  const answer = async (id, input, maxOutputTokens) => {
    const model = new MockLanguageModelV4({ doGenerate: async () => {
      if (id === 'repair-R01') throw new Error('官方Mock受控失败');
      return { content: [{ type: 'text', text: json(rows[5]) }], finishReason: { unified: 'stop', raw: 'stop' }, usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } }, warnings: [] };
    } });
    const result = await generateText({ model, instructions: input.instructions, prompt: input.prompt, temperature: 0, maxOutputTokens, maxRetries: 0 });
    return { result: { text: result.text } };
  };
  const outcomes = await repairItems(run, material, plan, answer);
  assert.deepEqual(outcomes.map(result => result.status), ['rejected', 'fulfilled']); preserveOtherItems(directory, plan);
  const r01 = JSON.parse(fs.readFileSync(path.join(directory, 'items/R01.json'), 'utf8'));
  const r06 = JSON.parse(fs.readFileSync(path.join(directory, 'items/R06.json'), 'utf8'));
  assert.equal(r01.attempts[2].generationState, 'failed'); assert.equal(r06.attempts[2].generationState, 'returned'); assert.equal(r06.attempts[2].checkState, 'passed');
  assert.equal(r01.attempts[1].kind, 'teacher_candidate'); assert.equal(r06.attempts[0].kind, 'cloud');
});
