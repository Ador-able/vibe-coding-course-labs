import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root, readJson, sha256 } from '../src/materials.mjs';
import { loadUpdateMaterials, assembleFollowup } from '../src/update-materials.mjs';

assert(process.argv[2], '显式指定实际report.json，不选择默认结果');
const filename = path.resolve(process.argv[2]), dir = path.dirname(filename);
const original = fs.readFileSync(filename), report = JSON.parse(original), material = loadUpdateMaterials();
assert.deepEqual(report.inputFiles, material.inputFiles);
const actualSettings=report.settings;
assert.equal(typeof actualSettings.baseURL,'string');assert.ok(actualSettings.baseURL);
assert.equal(typeof actualSettings.answer.model,'string');assert.ok(actualSettings.answer.model);
assert.equal(actualSettings.embedding.model,material.previousEmbeddings.settings.semantic.model);
assert.deepEqual({...actualSettings,baseURL:material.settings.baseURL,providerName:material.settings.providerName,answer:{...actualSettings.answer,model:material.settings.answer.model,providerOptions:material.settings.answer.providerOptions}},material.settings);
material.settings=actualSettings;
const calls = Object.values(report.phases).flatMap(phase => phase.http ?? []);
assert.equal(report.wrapperCalls, calls.length);
assert.equal(report.actualHttpRequests, calls.filter(call => call.actualFetchAttempt).length);
assert(report.actualHttpRequests <= 3);
for (const phase of [report.phases.A, report.phases.embedding, report.phases.B]) {
  if (phase.status === 'not_started') continue;
  assert.deepEqual(readJson(path.join(dir, phase === report.phases.A ? 'A-完整实际输入.json' : phase === report.phases.B ? 'B-完整实际输入.json' : 'embedding-完整实际输入.json')), phase.input);
  assert(phase.http.length <= 1);
  if (!phase.http[0]) continue;
  const wire = JSON.parse(phase.http[0].requestBody);
  if (phase === report.phases.embedding) {
    assert.deepEqual(wire.input, material.newValues.map(value => value.text));
    assert.equal(wire.model, material.settings.embedding.model); assert.equal(wire.dimensions, 1024);
    if (report.newEmbeddings) {
      const raw = JSON.parse(phase.http[0].responseBody);
      assert.equal(report.newEmbeddings.length, 2); assert.deepEqual(phase.sdk.values, wire.input);
      for (let i = 0; i < 2; i++) {
        assert.deepEqual(report.newEmbeddings[i], { ...material.newValues[i], embedding: phase.sdk.embeddings[i] });
        assert.equal(phase.sdk.embeddings[i].length, 1024); assert(phase.sdk.embeddings[i].every(Number.isFinite));
        assert.deepEqual(phase.sdk.embeddings[i], raw.data.find(value => value.index === i)?.embedding);
      }
    }
  } else {
    assert.equal(wire.model, material.settings.answer.model); assert.equal(wire.max_tokens, 1200); assert.deepEqual(wire.messages.map(({ role, content }) => ({ role, content })), [{ role: 'system', content: phase.input.system }, ...phase.input.messages]);
    if (phase.result) {
      assert.equal(phase.result.text, fs.readFileSync(path.join(dir, phase === report.phases.A ? 'A-实际完整回答.txt' : 'B-实际完整回答.txt'), 'utf8'));
      assert.equal(phase.result.text, phase.result.finalStep.text);
      assert.equal(phase.result.finishReason, phase.result.finalStep.finishReason);
      assert.equal(phase.result.response.id, JSON.parse(phase.http[0].responseBody).id);
    }
  }
}
if (report.phases.A.input) {
  assert.deepEqual(report.phases.A.input.sources, material.prompts.A.sources);
  assert.deepEqual(report.phases.A.input.messages, material.prompts.A.messages);
}
if (report.phases.update.status === 'updated') {
  const update = report.phases.update;
  assert.equal(update.remove.result, true); assert.equal(update.insert.result, material.action.replacement.id);
  assert.deepEqual(update.current, material.after);
  assert.equal(update.indexAfter.count, 22);
  for (const doc of material.after) assert.deepEqual(update.indexAfter.lookup.find(value => value.id === doc.id), { id: doc.id, found: true, document: doc });
  assert.deepEqual(update.indexAfter.lookup.find(value => value.id === material.action.oldBlock.id), { id: material.action.oldBlock.id, found: false, document: null });
  for (const id of material.action.unchangedBlockIds) assert.deepEqual(update.currentVectors.find(value => value.id === id), material.previousEmbeddings.embeddings.find(value => value.id === id));
  assert.deepEqual(update.archive.source, material.action.oldBlock);
  assert.deepEqual(update.archive.vector, material.previousEmbeddings.embeddings.find(value => value.id === material.action.oldBlock.id));
  if (update.persisted) {
    const stored = readJson(path.join(dir, 'current-index.json'));
    assert.deepEqual(stored.current, update.current); assert.deepEqual(stored.currentVectors, update.currentVectors);
    assert.deepEqual(stored.archive, update.archive);
    assert.equal(sha256(fs.readFileSync(path.join(dir, 'current-index.json'))), update.persisted.sha256);
  } else assert(report.error, '未保存当前JSON时须保留执行错误');
}
if (report.ranking) {
  assert.deepEqual(readJson(path.join(dir, '完整当前检索.json')), report.ranking);
  assert.deepEqual(report.ranking.currentCorpus, material.after);
  assert.deepEqual(report.ranking.where, material.settings.retrievalAfter.where);
  assert(report.ranking.fusion.all.every(value => value.id !== material.action.oldBlock.id));
}
if (report.phases.B.input) {
  const assembled = assembleFollowup(material, report.phases.A.result.text, report.ranking.fusion.all);
  assert.deepEqual(report.phases.B.input.messages, assembled.messages);
  assert.deepEqual(report.phases.B.input.sources, assembled.sources);
}
assert.deepEqual(fs.readFileSync(filename), original, '只读核对不修改实际报告');
process.stdout.write(JSON.stringify({ command: [process.execPath, ...process.argv.slice(1)], report: filename,
  sha256: sha256(original), recordConsistent: true, completed: report.completed, actualHttpRequests: report.actualHttpRequests,
  phases: Object.fromEntries(Object.entries(report.phases).map(([key, value]) => [key, value.status])),
  semanticReview: 'needs_human', scope: '原件、真实输入和版本对象一致；不判断答案陈述得到支持、文学采用、审美或真实付款。' }, null, 2) + '\n');
