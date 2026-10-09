import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { root, loadMaterials, readJson, writeJson, sha256, git } from '../src/materials.mjs';
import { rankMaterial } from '../src/retrieval.mjs';

const argument = process.argv[2];
assert(argument, '指定实际embeddings运行的report.json，不自动选择某次通过记录');
const inputPath = path.resolve(argument), actual = readJson(inputPath), material = loadMaterials();
assert.equal(actual.completed, true, '不能用未完成的向量记录继续排名');
assert.deepEqual(actual.values, material.values); assert.deepEqual(actual.settings, material.settings);
assert.deepEqual(actual.embeddings.map(({ embedding, ...value }) => value), material.values);
assert.equal(actual.actualHttpRequests, 3); assert.equal(actual.batches.length, 3);
for (const batch of actual.batches) {
  assert.equal(batch.http.responseStatus, 200); assert.equal(batch.error, null);
  const expected = material.values.slice(batch.start, batch.start + batch.inputs.length);
  assert.deepEqual(batch.inputs, expected);
  const request = JSON.parse(batch.http.requestBody), response = JSON.parse(batch.http.responseBody);
  assert.deepEqual(request.input, expected.map(x => x.text)); assert.equal(request.dimensions, 1024);
  assert.equal(response.data.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    const vector = actual.embeddings[batch.start + i].embedding;
    assert.equal(vector.length, 1024); assert(vector.every(Number.isFinite));
    assert.deepEqual(vector, batch.sdk.embeddings[i]);
    assert.deepEqual(vector, response.data.find(x => x.index === i)?.embedding);
  }
}
const runId = randomUUID(), dir = path.join(root, 'runs', 'retrieval-' + runId);
fs.mkdirSync(dir, { recursive: true });
const report = { runId, startedAt: new Date().toISOString(), command: [process.execPath, ...process.argv.slice(1)],
  gitHead: git(['rev-parse', 'HEAD']), node: process.version,
  lockSHA256: sha256(fs.readFileSync(path.join(root, 'pnpm-lock.yaml'))),
  embeddingRecord: { runId: actual.runId, pathAtExecution: inputPath, sha256: sha256(fs.readFileSync(inputPath)) },
  inputFiles: material.inputFiles, settings: material.settings, corpus: material.corpus, queries: material.queries,
  fullBody: material.body, pages: material.pages, embeddingObservation: actual,
  ranking: await rankMaterial(material, actual.embeddings),
  newHttpRequests: 0, answerGeneration: 0, modelRerank: 0, chapterSave: 0,
  judgment: '仅生成实际检索候选、分数和融合；相关性、完整支持关系与来源需人工回查，不自动判答案合格' };
report.finishedAt = new Date().toISOString();
writeJson(path.join(dir, 'observation.json'), report);
const bytes = fs.readFileSync(path.join(dir, 'observation.json'));
fs.writeFileSync(path.join(root, 'public/observation.json'), bytes);
assert.deepEqual(bytes, fs.readFileSync(path.join(root, 'public/observation.json')));
const target = path.join(root, 'public/materials'); fs.mkdirSync(target, { recursive: true });
for (const item of material.inputFiles) fs.copyFileSync(path.join(root, item.path), path.join(target, item.name));
writeJson(path.join(dir, 'record-bytes.json'), { name: 'observation.json', bytes: bytes.length, sha256: sha256(bytes),
  publicCopy: 'public/observation.json', publicSameBytes: true });
process.stdout.write(JSON.stringify({ runId, path: path.join(dir, 'observation.json'), bytes: bytes.length, cases: report.ranking.cases.length }) + '\n');
