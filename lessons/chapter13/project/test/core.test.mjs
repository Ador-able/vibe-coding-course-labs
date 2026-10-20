import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { teaching } from '../src/teaching.mjs';
import { checkExtraction } from '../src/checks.mjs';
import { root, json } from '../src/files.mjs';
import { registerBatch, preserveOtherItems, repairItems } from '../src/batch.mjs';
import { generateText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const material = teaching();
const rows = material.reference.records.map(row => ({ ...row, evidence: material.logs.records.find(source => source.id === row.sourceId).text }));
const temporary = prefix => { fs.mkdirSync(path.join(root, '.tmp'), { recursive: true }); return fs.mkdtempSync(path.join(root, '.tmp', prefix)); };
const extraction = candidate => ({ reportPath: 'official-mock-test-only', calls: [{ status: 'returned', result: { text: json({ records: candidate, summary: material.reference.summaries.eight }) } }] });
test('约数与计划不变成实际；重复段落不扩充指定同行群体分母', () => {
  const candidate = { records: structuredClone(rows.slice(0, 8)), summary: { ...structuredClone(material.reference.summaries.eight), limits: material.reference.limits } };
  assert.equal(checkExtraction(json(candidate), material.logs, material.reference, 'extraction').mechanicalState, 'passed');
  candidate.records[0].totalCount = 30;
  candidate.records[6].status = 'observed';
  candidate.summary.ratioSourceIds.push('R06'); candidate.summary.groupDenominator = 16;
  const check = checkExtraction(json(candidate), material.logs, material.reference, 'extraction');
  assert.deepEqual(check.valueIssues.map(issue => issue.sourceId), ['R01', 'R07']);
  assert.ok(check.summaryIssues.some(issue => issue.field === 'ratioSourceIds'));
  assert.ok(check.summaryIssues.some(issue => issue.field === 'groupDenominator'));
});
test('CSV独立进程保留全部业务值，区别0/null并正确处理文本换行', () => {
  const directory = temporary('csv-'), input = path.join(directory, 'candidate.json'), output = path.join(directory, 'csv');
  const sample = structuredClone(rows); sample[0].group = '仅测试CSV的, "引号"\n第二行';
  fs.writeFileSync(input, json({ records: sample, summary: material.reference.summaries.ten }));
  for (const mode of ['export', 'readback']) {
    const result = spawnSync(process.env.LAB_PYTHON || 'python', ['-X', 'utf8', 'scripts/csv-records.py', mode, path.relative(root, input), path.relative(root, output)], { cwd: root, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  const receipt = JSON.parse(fs.readFileSync(path.join(output, 'csv-readback.json'), 'utf8'));
  assert.deepEqual(receipt.restoredRows, sample.map(row => Object.fromEntries(material.reference.fields.map(field => [field, row[field]]))));
  assert.equal(receipt.restoredRows[0].totalCount, null); assert.equal(receipt.restoredRows[3].formalCount, 0);
});
test('合格原项不追加修复；真实未通过候选的受控测试保留局部失败及其他项字节', async () => {
  const allGood = { directory: temporary('good-') }, goodPlan = registerBatch(allGood, extraction(rows.slice(0, 8)), material);
  assert.deepEqual(goodPlan.repairIds, []);
  const candidate = structuredClone(rows.slice(0, 8)); candidate[0].totalCount = 30; candidate[6].status = 'observed';
  const run = { directory: temporary('partial-') }, plan = registerBatch(run, extraction(candidate), material);
  assert.deepEqual(plan.repairIds, ['R01', 'R07']);
  const answer = async (id, input, maxOutputTokens) => {
    const model = new MockLanguageModelV4({ doGenerate: async () => {
      if (id === 'repair-R01') throw new Error('官方Mock受控失败，只用于本地测试');
      return { content: [{ type: 'text', text: json(rows[6]) }], finishReason: { unified: 'stop', raw: 'stop' }, usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } }, warnings: [] };
    } });
    const result = await generateText({ model, instructions: input.instructions, prompt: input.prompt, temperature: 0, maxOutputTokens, maxRetries: 0 });
    return { result: { text: result.text } };
  };
  const outcomes = await repairItems(run, material, plan, answer);
  assert.deepEqual(outcomes.map(outcome => outcome.status), ['rejected', 'fulfilled']); preserveOtherItems(run.directory, plan);
  const failed = JSON.parse(fs.readFileSync(path.join(run.directory, 'items/R01.json'), 'utf8'));
  const fixed = JSON.parse(fs.readFileSync(path.join(run.directory, 'items/R07.json'), 'utf8'));
  assert.equal(failed.attempts[1].generationState, 'failed'); assert.equal(fixed.attempts[1].checkState, 'passed');
  assert.equal(failed.attempts[0].record.totalCount, 30);
});
