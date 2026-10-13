import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root, readJson, sha256, newRun, saveRun } from '../src/materials.mjs';
import { compareChunks } from '../src/chunks.mjs';

const run = newRun(process.argv[2]);
const bodyBytes = fs.readFileSync(path.join(root, 'inputs/井房里的铜杆-完整正文.txt'));
const definitionBytes = fs.readFileSync(path.join(root, 'inputs/完整资料与问题.json'));
const definition = JSON.parse(definitionBytes);
const mapping = readJson(path.join(root, 'public/source-document.json'));
const readingBytes = fs.readFileSync(path.join(root, 'public/records/reading.json'));
const reading = JSON.parse(readingBytes);
assert.equal(sha256(bodyBytes), mapping.bodySha256);
assert.equal(reading.documents[0].fileSha256, mapping.sourceFixture.fileSha256);
const methods = await compareChunks(bodyBytes.toString('utf8'), mapping.parentPages, definition.questions.literal);
const report = { ...run, directory: undefined, finishedAt: new Date().toISOString(), components: { textsplitters: '1.0.2', core: '1.2.14' },
  inputFiles: [{ name: '井房里的铜杆-完整正文.txt', bytes: bodyBytes.length, sha256: sha256(bodyBytes) }, { name: '完整资料与问题.json', bytes: definitionBytes.length, sha256: sha256(definitionBytes) }],
  readingRunId: reading.runId, readingSha256: sha256(readingBytes), bodySha256: sha256(bodyBytes), question: definition.questions.chunking,
  conditionsScope: '80 UTF16码元仅为课堂对比；字面选取规则不评价语义排名或生产最佳参数。', methods, newPdfReads: 0, newModelCalls: 0 };
saveRun(run, report, 'chunks.json');
console.log(JSON.stringify({ runId: run.runId, methods: methods.map(row => ({ id: row.condition.id, chunks: row.chunks.length })), modelCalls: 0 }));
