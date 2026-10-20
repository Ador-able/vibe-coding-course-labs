import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root, readJson, sha256, writeNew } from '../src/files.mjs';
import { teaching } from '../src/teaching.mjs';
import { checkLong, checkLabels, checkExtraction } from '../src/checks.mjs';
import { checkItem } from '../src/batch.mjs';

const material = teaching(), index = readJson(path.join(root, 'records/index.json'));
const knownIds = ['M01', ...material.long.chapters.flatMap(chapter => chapter.paragraphs.map(p => p.sourceId))];
const checked = [];
const reportPaths = Object.values(index.groups);
if (index.groups.batch) {
  const repairs = path.join(path.dirname(index.groups.batch), 'repair-report.json');
  if (fs.existsSync(path.join(root, repairs))) reportPaths.push(repairs);
}
for (const reportPath of reportPaths) {
  const report = readJson(path.join(root, reportPath)), directory = path.dirname(path.join(root, reportPath));
  // 只展示或核查当前冻结输入对应的实录，历史原件不改写。
  if (JSON.stringify(report.inputFiles) !== JSON.stringify(material.registry.files)) continue;
  if (!['long-text', 'classification-discovery', 'classification-v1', 'classification-v2', 'extraction', 'templates', 'repairs'].includes(report.group)) continue;
  for (const call of report.calls) {
    const at = path.join(directory, call.id);
    for (const exchange of call.http) {
      assert.equal(sha256(fs.readFileSync(path.join(at, 'request-body.json'))), exchange.requestSHA256);
      const request = readJson(path.join(at, 'request-body.json'));
      assert.deepEqual(request.messages, [{ role: 'system', content: call.input.instructions }, { role: 'user', content: call.input.prompt }]);
      assert.equal(request.model, call.settings.modelId); assert.equal(request.max_tokens, call.settings.maxOutputTokens); assert.equal(request.temperature, 0);
      if (call.settings.thinking) assert.deepEqual(request.thinking, call.settings.thinking);
      if (exchange.responseBody !== undefined) assert.equal(sha256(fs.readFileSync(path.join(at, 'response-body.txt'))), exchange.responseSHA256);
    }
    let inspection = { generationState: call.status, semanticDecision: 'pending', wholeTaskAdopted: false, error: call.error ?? null };
    if (call.result) {
      const text = fs.readFileSync(path.join(at, 'output.txt'), 'utf8'); assert.equal(text, call.result.text);
      const response = JSON.parse(call.http[0].responseBody); assert.equal(response.choices[0].message.content, text);
      assert.equal(response.choices[0].finish_reason, call.result.rawFinishReason);
      if (report.group === 'long-text') inspection = checkLong(text, knownIds, material.files['长文-独立核查参考.json'], call.id.startsWith('02-map'));
      else if (report.group.startsWith('classification-')) inspection = checkLabels(text, report.stage, call.materialScope, material.labels, material.files[`分类-口径-${report.stage}.json`], material.files['分类-独立参考.json']);
      else if (report.group === 'repairs') inspection = checkItem(text, call.materialScope[0], material);
      else inspection = checkExtraction(text, material.logs, material.reference, report.group === 'extraction' ? 'extraction' : 'templateComparison');
    }
    const output = path.join(at, 'inspection.json');
    if (fs.existsSync(output)) assert.deepEqual(readJson(output), inspection, '已有检查应与当前实际原件一致。'); else writeNew(output, inspection);
    checked.push({ group: report.group, id: call.id, mechanicalState: inspection.mechanicalState ?? 'unavailable' });
  }
}
console.log(JSON.stringify({ checked, newModelCalls: 0 }));
