import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root, readJson, writeJson, sha256 } from '../src/materials.mjs';
import { checkTeaching } from '../src/frozen.mjs';

const teaching = checkTeaching();
const notes = readJson(path.join(root, 'inputs/便签与检索问题.json'));
const originals = readJson(path.join(root, 'inputs/原文片段.json'));
const chunks = readJson(path.join(root, 'public/records/chunks.json'));
const reading = readJson(path.join(root, 'public/records/reading.json'));
const native = reading.documents.find(row => row.fixtureKey === 'native-v1');
const body = fs.readFileSync(path.join(root, 'inputs/凡人C05-完整原文.txt'), 'utf8');
const corpus = chunks.methods.find(row => row.condition.id === 'structure80').chunks.map(chunk => {
  assert.equal(body.slice(chunk.bodyRange.start, chunk.bodyRange.end), chunk.text);
  return { id: 'story-' + chunk.chunkId, blockId: chunk.chunkId, title: 'C05 墨大夫与神手谷', docId: 'fanren-C05', collection: 'story', version: 'v1', projectCode: 'C05', text: chunk.text, textSha256: sha256(chunk.text), originLabel: '凡人C05原文切块',
    source: { fileName: native.fileName, filePath: native.filePath, fileSha256: native.fileSha256, parseProfile: native.parseProfile, physicalPages: chunk.sourcePages, bodySha256: sha256(body), bodyRange: chunk.bodyRange, originalChunk: chunk, parentPages: native.pages.filter(page => chunk.sourcePages.includes(page.physicalPage)).map(page => ({ physicalPage: page.physicalPage, imagePath: page.imagePath, blocks: page.blocks })) } };
});
fs.mkdirSync(path.join(root, 'public/materials'), { recursive: true });
function textSource(note, collection = 'memo') {
  const filename = note.docId + '-' + note.version + '.txt';
  fs.writeFileSync(path.join(root, 'public/materials', filename), note.text);
  return { ...note, id: note.docId + '-' + note.version, blockId: note.docId + '-' + note.version, label: note.docId + '-' + note.version, collection, textSha256: sha256(note.text), source: { fileName: filename, bodyRange: { start: 0, end: note.text.length, positionUnit: 'utf16' }, lineRange: [1, note.text.split('\n').length], ...note.originalSource } };
}
// 三十份连续原文保留完整字句、资料编号和来源范围，向量输入不使用摘要。
corpus.push(...originals.sources.map(source => textSource({ docId: 'original-' + source.id, projectCode: source.id, version: 'v1', title: source.id + ' ' + source.title, text: source.text, originLabel: '忘语《凡人修仙传》完整原文片段', originalSource: { segmentId: source.id, originalRange: { start: source.start, end: source.end, positionUnit: 'utf16' }, originalSha256: originals.originalSha256, sourceSha256: originals.sourceSha256 } }, 'original')));
corpus.push(...notes.notes.map(note => textSource(note)));
const queries = notes.queries.map(query => ({ ...query, keywords: query.lexicalQuery, where: query.baseWhere, filterVariant: query.filteredWhere }));
const values = [...corpus.map(({ id, text, textSha256 }) => ({ id, role: 'document', text, textSha256 })), ...queries.map(query => ({ id: query.id, role: 'query', text: query.semanticQuery, textSha256: sha256(query.semanticQuery) }))];
const settings = { lexical: { properties: ['text'], exact: false, tolerance: 0, threshold: 1, relevance: { k: 1.2, b: 0.75 }, limit: 3 }, semantic: { limit: 3, maxRetries: 0, maxParallelCalls: 1, timeoutMs: 120000 }, fusion: { k: 60, rankStartsAt: 1 }, source: '共用设置中的真实向量服务；无额外指令前缀，服务内部处理未知。' };
const material = { corpus, queries, values, settings, teachingFreeze: teaching, chunkRunId: chunks.runId, readingRunId: reading.runId };
writeJson(path.join(root, 'inputs/retrieval/material.json'), material);
const bytes = fs.readFileSync(path.join(root, 'inputs/retrieval/material.json'));
writeJson(path.join(root, 'inputs/retrieval/manifest.json'), { frozen: true, teachingFreeze: teaching, files: [{ name: 'material.json', bytes: bytes.length, sha256: sha256(bytes) }] });
writeJson(path.join(root, 'inputs/update/draft.json'), { replacement: textSource(notes.update.noteV2), ...notes.update });
writeJson(path.join(root, 'public/records/evaluation-cards.json'), readJson(path.join(root, 'inputs/评估题卡与判据.json')));
console.log(JSON.stringify({ storyChunks: corpus.filter(row => row.collection === 'story').length, originalSegments: originals.sources.length, notes: notes.notes.length, queries: queries.length, embeddingInputs: values.length, modelCalls: 0 }));
