import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readJson, writeNew, replaceJson, sha256, json } from './files.mjs';
import { checkExtraction, parseCandidate } from './checks.mjs';

export function checkItem(text, id, material) {
  const parsed = parseCandidate(text);
  if (parsed.error) return { parseError: parsed.error, mechanicalState: 'failed', semanticDecision: 'pending', issues: ['没有取得完整字段对象。'] };
  const logs = { ...material.logs, scope: { extraction: [id] } };
  const check = checkExtraction(JSON.stringify({ records: [parsed.value], summary: { ...material.reference.summaries.eight, limits: [] } }), logs, material.reference, 'extraction');
  delete check.summaryIssues;
  check.mechanicalState = ['formatIssues', 'coverageIssues', 'valueIssues', 'evidenceIssues'].every(key => !check[key].length) ? 'passed' : 'failed';
  return check;
}
export function registerBatch(run, extraction, material) {
  const candidate = parseCandidate(extraction.calls[0]?.result?.text || '');
  const rows = Array.isArray(candidate.value?.records) ? candidate.value.records : [];
  const seeds = material.files['逐项-教师错误候选.json'];
  fs.mkdirSync(path.join(run.directory, 'items'));
  const files = {};
  for (const id of material.logs.scope.batchBase) {
    const originalRows = rows.filter(row => row?.sourceId === id), original = originalRows.length === 1 ? originalRows[0] : null;
    const cloud = { kind: 'cloud', reportPath: extraction.reportPath, sourceId: id, generationState: extraction.calls[0]?.status ?? 'unavailable', record: original,
      missingRecord: original === null, check: original ? checkItem(json(original), id, material) : { mechanicalState: 'unavailable', parseError: candidate.error }, contentDecision: 'needs_human' };
    const seed = seeds.candidates.find(row => row.sourceId === id);
    cloud.checkState = cloud.check.mechanicalState;
    const item = { sourceId: id, attempts: [cloud], currentAttempt: 0 };
    if (seed) { const check = checkItem(json(seed), id, material); item.attempts.push({ kind: 'teacher_candidate', generationState: 'provided', record: seed, check, checkState: check.mechanicalState, contentDecision: 'exercise_input' }); }
    const file = path.join(run.directory, 'items', `${id}.json`); writeNew(file, item); files[id] = sha256(fs.readFileSync(file));
  }
  const plan = { sourceIds: material.logs.scope.batchBase, repairIds: seeds.candidates.map(row => row.sourceId), initialItemSHA256: files,
    extractionReportPath: extraction.reportPath, summary: candidate.value?.summary ?? null, summaryAdopted: false,
    scope: '真实整批原答与教师错误候选分列；只修复两份教师候选，不重算或采用整批汇总。' };
  assert.deepEqual(plan.repairIds, ['R01', 'R06']); writeNew(path.join(run.directory, 'plan.json'), plan);
  return plan;
}
export function preserveOtherItems(directory, plan) {
  for (const id of plan.sourceIds.filter(id => !plan.repairIds.includes(id))) assert.equal(sha256(fs.readFileSync(path.join(directory, 'items', `${id}.json`))), plan.initialItemSHA256[id], `${id} 原字节须保留`);
}
export function updateItem(directory, id, operation) {
  const file = path.join(directory, 'items', `${id}.json`), item = readJson(file);
  operation(item); replaceJson(file, item); return item;
}
export async function repairItems(run, material, plan, answer) {
  const directory = run.directory;
  const outcomes = await Promise.allSettled(plan.repairIds.map(async id => {
    const instructions = material.files['抽取-共同规则.txt'], prompt = material.files[`逐项-完整任务-${id}.txt`];
    const recipe = { sourceId: id, sourceKind: 'teacher_candidate', promptSHA256: sha256(prompt), instructionsSHA256: sha256(instructions), settings: material.settings };
    updateItem(directory, id, item => { item.attempts.push({ kind: 'cloud_repair', recipe, generationState: 'running', checkState: 'pending', contentDecision: 'pending' }); item.currentAttempt = 2; });
    try {
      const call = await answer(`repair-${id}`, { instructions, prompt }, material.settings.maxOutputTokens.itemRepair, [id]);
      const check = checkItem(call.result.text, id, material);
      updateItem(directory, id, item => Object.assign(item.attempts[2], { generationState: 'returned', record: parseCandidate(call.result.text).value,
        callPath: `repair-${id}/record.json`, check, checkState: check.mechanicalState, contentDecision: 'needs_human' }));
    } catch (error) {
      updateItem(directory, id, item => Object.assign(item.attempts[2], { generationState: 'failed', error: { name: error.name, message: error.message },
        callPath: `repair-${id}/record.json`, checkState: 'unavailable', contentDecision: 'unavailable' })); throw error;
    }
  }));
  preserveOtherItems(directory, plan); return outcomes;
}
