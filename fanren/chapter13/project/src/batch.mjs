import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readJson, writeNew, replaceJson, sha256, json } from './files.mjs';
import { checkExtraction, parseCandidate } from './checks.mjs';

export function checkItem(text, id, material) {
  const parsed = parseCandidate(text);
  if (parsed.error) return { parseError: parsed.error, mechanicalState: 'failed', semanticDecision: 'pending', issues: ['没有取得完整字段对象。'] };
  const logs = { ...material.logs, scope: { extraction: [id] } };
  const check = checkExtraction(json({ records: [parsed.value], summary: { ...material.reference.summaries.eight, limits: [] } }), logs, material.reference, 'extraction');
  delete check.summaryIssues;
  check.mechanicalState = ['formatIssues', 'coverageIssues', 'valueIssues', 'evidenceIssues'].every(key => !check[key].length) ? 'passed' : 'failed';
  return check;
}
export function registerBatch(run, extraction, material) {
  const candidate = parseCandidate(extraction.calls[0]?.result?.text || '');
  const rows = Array.isArray(candidate.value?.records) ? candidate.value.records : [];
  fs.mkdirSync(path.join(run.directory, 'items'));
  const files = {}, failed = [];
  for (const id of material.logs.scope.batchBase) {
    const matches = rows.filter(row => row?.sourceId === id), original = matches.length === 1 ? matches[0] : null;
    const check = original ? checkItem(json(original), id, material) : { mechanicalState: 'unavailable', parseError: candidate.error };
    const cloud = { kind: 'cloud', reportPath: extraction.reportPath, sourceId: id, generationState: extraction.calls[0]?.status ?? 'unavailable', record: original, missingRecord: original === null, check, checkState: check.mechanicalState, contentDecision: 'needs_human' };
    const file = path.join(run.directory, 'items', id + '.json');
    writeNew(file, { sourceId: id, attempts: [cloud], currentAttempt: 0 }); files[id] = sha256(fs.readFileSync(file));
    if (original && check.mechanicalState === 'failed') failed.push(id);
  }
  // 只选真实存在且未通过的原项，最多两项；不为演示制造模型失败。
  const plan = { sourceIds: material.logs.scope.batchBase, failedIds: failed, repairIds: failed.slice(0, material.settings.calls.itemRepairMaximum), initialItemSHA256: files,
    extractionReportPath: extraction.reportPath, summary: candidate.value?.summary ?? null, summaryAdopted: false,
    scope: '全部原项保留；仅真实字段候选未通过时定点修复，原汇总不自动重算或采用。' };
  writeNew(path.join(run.directory, 'plan.json'), plan); return plan;
}
export function preserveOtherItems(directory, plan) {
  for (const id of plan.sourceIds.filter(id => !plan.repairIds.includes(id))) assert.equal(sha256(fs.readFileSync(path.join(directory, 'items', id + '.json'))), plan.initialItemSHA256[id], id + ' 原字节须保留');
}
export function updateItem(directory, id, operation) {
  const file = path.join(directory, 'items', id + '.json'), item = readJson(file);
  operation(item); replaceJson(file, item); return item;
}
export async function repairItems(run, material, plan, answer) {
  const directory = run.directory;
  const outcomes = await Promise.allSettled(plan.repairIds.map(async id => {
    const source = material.logs.records.find(row => row.id === id), item = readJson(path.join(directory, 'items', id + '.json'));
    const instructions = material.files['抽取-共同规则.txt'];
    const prompt = material.files['逐项-修复模板.txt'] + '\n\n<rules>\n' + material.files['抽取-字段与统计口径.txt'] + '\n</rules>\n<source>\n' + json(source) + '</source>\n<original_candidate>\n' + json(item.attempts[0].record) + '</original_candidate>\n<actual_check>\n' + json(item.attempts[0].check) + '</actual_check>';
    const recipe = { sourceId: id, sourceKind: 'actual_failed_candidate', promptSHA256: sha256(prompt), instructionsSHA256: sha256(instructions), settings: material.settings };
    const index = item.attempts.length;
    updateItem(directory, id, item => { item.attempts.push({ kind: 'cloud_repair', recipe, generationState: 'running', checkState: 'pending', contentDecision: 'pending' }); item.currentAttempt = index; });
    try {
      const call = await answer('repair-' + id, { instructions, prompt }, material.settings.maxOutputTokens.itemRepair, [id]);
      const check = checkItem(call.result.text, id, material);
      updateItem(directory, id, item => Object.assign(item.attempts[index], { generationState: 'returned', record: parseCandidate(call.result.text).value, callPath: 'repair-' + id + '/record.json', check, checkState: check.mechanicalState, contentDecision: 'needs_human' }));
    } catch (error) {
      updateItem(directory, id, item => Object.assign(item.attempts[index], { generationState: 'failed', error: { name: error.name, message: error.message }, callPath: 'repair-' + id + '/record.json', checkState: 'unavailable', contentDecision: 'unavailable' })); throw error;
    }
  }));
  preserveOtherItems(directory, plan); return outcomes;
}
