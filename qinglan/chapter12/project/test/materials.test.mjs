import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { root, readJson, sha256 } from '../src/materials.mjs';
import { checkTeaching } from '../src/frozen.mjs';
import { compareChunks } from '../src/chunks.mjs';
import { replaceCurrentSource, rankCurrentSource } from '../src/update-index.mjs';

test('真实PDF读取保留全文、扫描缺口、同名版本和打开失败', () => {
  checkTeaching();
  const definition = readJson(path.join(root, 'inputs/完整资料与问题.json'));
  const observation = readJson(path.join(root, 'public/records/reading.json'));
  const [native, scanned, updated, broken] = observation.documents;
  assert.deepEqual(native.pages.map(page => page.physicalPage), [1, 2, 3]);
  const squash = text => text.replaceAll(/\s/g, '');
  for (const [pageIndex, [first, last]] of definition.pageParagraphs.entries()) {
    for (const paragraph of definition.paragraphs.slice(first, last + 1)) assert(squash(native.pages[pageIndex].text).includes(squash(paragraph)), `第${pageIndex + 1}页正文必须完整`);
  }
  assert.equal(scanned.pages[1].textState, 'empty-text'); assert.equal(scanned.pages[1].blocks.length, 0); assert(scanned.pages[1].imagePath);
  assert.equal(scanned.pages[2].physicalPage, 3); assert.equal(broken.pageCount, null); assert.equal(broken.openStatus, 'open-error');
  assert.equal(native.fileName, updated.fileName); assert.notEqual(native.fileSha256, updated.fileSha256);
  for (const document of [native, scanned, updated]) for (const page of document.pages) { const image = fs.readFileSync(path.join(root, 'public', page.imagePath)); assert.equal(image.readUInt32BE(16), 2380); assert.equal(image.readUInt32BE(20), 3368); }
});

test('切块能回到完整正文，父页沿用相同子块且不补无命中内容', async () => {
  const bytes = fs.readFileSync(path.join(root, 'inputs/井房里的铜杆-完整正文.txt'));
  const mapping = readJson(path.join(root, 'public/source-document.json')); assert.equal(sha256(bytes), mapping.bodySha256);
  const body = bytes.toString('utf8'); const methods = await compareChunks(body, mapping.parentPages, ['卡住', '筑基功法']);
  for (const method of methods) for (const chunk of method.chunks) assert.equal(body.slice(chunk.bodyRange.start, chunk.bodyRange.end), chunk.text);
  assert.deepEqual(methods[3].chunks, methods[0].chunks);
  assert.equal(methods[3].retrievals[0].context, mapping.parentPages[1].body);
  for (const method of methods) assert.equal(method.retrievals[1].context, '');
});

test('来源替换只删除旧版本，保留旧引用快照和不变资料向量', async () => {
  // 这里的二维数字仅验证索引业务，不作为语义检索实录。
  const old = { id: 'fee-v1', text: '旧日期与费用', collection: 'memo', version: 'v1', projectCode: 'JF-17' };
  const kept = { id: 'task-v1', text: 'JF-17 查看安排', collection: 'memo', version: 'v1', projectCode: 'JF-17' };
  const fresh = { ...old, id: 'fee-v2', text: '新日期与费用', version: 'v2' };
  const vectors = [{ id: old.id, embedding: [1, 0] }, { id: kept.id, embedding: [0, 1] }];
  const observation = {};
  const material = { before: [old, kept], after: [fresh, kept], previousEmbeddings: { embeddings: vectors },
    action: { oldBlock: old, replacement: fresh, unchangedBlockIds: [kept.id] }, prompts: { sourcesA: [old] },
    settings: { retrievalAfter: { where: { collection: 'memo', projectCode: 'JF-17' }, lexical: { properties: ['text'], limit: 3, exact: false, tolerance: 0, threshold: 1 }, semantic: { limit: 3 }, fusion: { k: 60 } } },
    query: { id: 'followup', keywords: 'JF-17 费用', followUp: '现在呢？', independentQuery: 'JF-17当前费用', queryAuthor: '教师查询' } };
  const index = await replaceCurrentSource(material, [{ id: fresh.id, embedding: [1, 1] }], observation, () => {});
  assert.equal(observation.indexAfter.lookup.find(row => row.id === old.id).found, false);
  assert.deepEqual(observation.archive.source, old); assert.deepEqual(index.currentVectors.find(row => row.id === kept.id), vectors[1]);
  const ranked = await rankCurrentSource(material, index, { id: 'followup', embedding: [1, 1] });
  assert.deepEqual(new Set(ranked.eligibleIds), new Set([fresh.id, kept.id]));
});
