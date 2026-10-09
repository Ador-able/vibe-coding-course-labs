import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root, readJson, sha256, git } from './materials.mjs';

export const inputNames = {
  before: '04-更新前完整22块.json', after: '05-更新后拟用完整22块.json',
  action: '06-更新动作与当前版本范围.json', query: '07-原问题必要历史追问与独立查询.json',
  prompts: '08-两轮完整提示与实际历史装配定义.json', newValues: '09-两项新增向量的完整输入.json',
  previousCandidates: '10-前轮实际候选全文与引用映射.json', settings: '11-新增有限调用与复用契约.json',
  previousEmbeddings: '14-既有25项真实向量与完整返回.json', references: '15-当前索引完整版本与旧引用回查.json'
};

export function sourceText(source) {
  const [first, last] = source.locator.lineRange;
  return `来源标签：[${source.label}]\n资料ID：${source.docId}\n版本：${source.version}\n块ID：${source.blockId}\n位置：${source.locator.fileName}，第${first}—${last}行\n正文SHA256：${source.textSha256}\n完整正文：\n${source.text}`;
}

export function loadUpdateMaterials() {
  const dir = path.join(root, 'inputs/update');
  const manifest = readJson(path.join(dir, '冻结完整输入清单.json'));
  const inputFiles = manifest.files.map(file => {
    const bytes = fs.readFileSync(path.join(dir, file.name));
    assert.equal(bytes.length, file.bytes, file.name); assert.equal(sha256(bytes), file.sha256, file.name);
    return { ...file, path: 'inputs/update/' + file.name };
  });
  const material = Object.fromEntries(Object.entries(inputNames).map(([key, name]) => [key, readJson(path.join(dir, name))]));
  const { before, after, action, query, prompts, newValues, previousCandidates, previousEmbeddings, settings } = material;
  assert.equal(before.length, 22); assert.equal(after.length, 22); assert.equal(new Set(after.map(row => row.id)).size, 22);
  for (const row of [...before, ...after]) assert.equal(sha256(row.text), row.textSha256, row.id);
  for (const id of action.unchangedBlockIds) assert.deepEqual(after.find(row => row.id === id), before.find(row => row.id === id));
  assert.equal(action.unchangedBlockIds.length, 21);
  const old = before.find(row => row.id === action.oldBlock.id);
  assert.deepEqual(old, action.oldBlock);
  assert.deepEqual(after.find(row => row.id === action.replacement.id), action.replacement);
  assert.deepEqual(after, before.map(row => row.id === old.id ? action.replacement : row));
  assert.equal(fs.readFileSync(path.join(root, 'public/materials', action.replacement.source.fileName), 'utf8'), action.replacement.text);
  assert.equal(previousEmbeddings.completed, true);
  assert.equal(previousEmbeddings.runId, settings.existingEmbeddingRun);
  assert.equal(previousCandidates.sourceObservationRunId, settings.existingRetrievalRun);
  assert.equal(previousEmbeddings.settings.semantic.baseURL, settings.baseURL);
  assert.equal(previousEmbeddings.settings.semantic.model, settings.embedding.model);
  assert.equal(previousEmbeddings.settings.semantic.dimensions, settings.embedding.dimensions);
  assert.equal(previousEmbeddings.settings.semantic.provider, settings.provider);
  assert.equal(previousEmbeddings.settings.semantic.sdk, settings.sdk);
  assert.equal(previousEmbeddings.lockSHA256, sha256(fs.readFileSync(path.join(root, 'pnpm-lock.yaml'))));
  assert.deepEqual(previousEmbeddings.values.slice(0, 22), before.map(({ id, text, textSha256 }) => ({ id, role: 'document', text, textSha256 })));
  assert.deepEqual(previousEmbeddings.embeddings.map(({ embedding, ...value }) => value), previousEmbeddings.values);
  for (const batch of previousEmbeddings.batches) {
    const expected = previousEmbeddings.values.slice(batch.start, batch.start + batch.inputs.length);
    assert.deepEqual(batch.inputs, expected);
    const request = JSON.parse(batch.http.requestBody), response = JSON.parse(batch.http.responseBody);
    assert.equal(batch.http.responseStatus, 200); assert.equal(batch.error, null);
    assert.equal(batch.http.url, settings.baseURL + '/embeddings');
    assert.equal(request.model, settings.embedding.model); assert.equal(request.dimensions, settings.embedding.dimensions);
    assert.deepEqual(request.input, expected.map(row => row.text));
    assert.deepEqual(batch.sdk.values, request.input);
    assert.equal(response.data.length, expected.length);
    for (let i = 0; i < expected.length; i++) {
      const saved = previousEmbeddings.embeddings[batch.start + i];
      assert.equal(sha256(saved.text), saved.textSha256);
      assert.equal(saved.embedding.length, settings.embedding.dimensions); assert(saved.embedding.every(Number.isFinite));
      assert.deepEqual(saved.embedding, batch.sdk.embeddings[i]);
      assert.deepEqual(saved.embedding, response.data.find(row => row.index === i)?.embedding);
    }
  }
  assert.equal(previousEmbeddings.values.length, 25);
  const candidateIds = previousCandidates.historicalRanking.fusion.all.map(row => row.id).sort();
  assert.deepEqual(candidateIds, prompts.A.sources.map(row => row.blockId).sort());
  assert.deepEqual(prompts.A.sources, previousCandidates.inputSources);
  const sourceMap = new Map([...prompts.A.sources, ...prompts.B.possibleSourceMapping].map(source => [source.blockId, source]));
  for (const source of sourceMap.values()) {
    const row = [...before, ...after].find(row => row.id === source.blockId);
    assert.equal(source.text, row.text); assert.equal(source.textSha256, row.textSha256);
    assert.equal(source.docId, row.docId); assert.equal(source.version, row.version);
    assert.equal(source.locator.kind, 'text-lines'); assert.equal(source.locator.physicalPage, null);
    const original = source.blockId === old.id ? fs.readFileSync(path.join(dir, '01-费用便签-v1完整原文.txt'), 'utf8')
      : source.blockId === action.replacement.id ? fs.readFileSync(path.join(dir, '02-费用便签-v2完整原文.txt'), 'utf8')
      : fs.readFileSync(path.join(dir, '03-检查委托-v1完整原文.txt'), 'utf8');
    assert.equal(original.slice(source.locator.bodyRange.start, source.locator.bodyRange.end), source.text);
    assert.equal(sha256(original), source.locator.fileSha256);
  }
  assert.equal(newValues.length, 2);
  assert.deepEqual(newValues[0], { id: action.replacement.id, role: 'document', text: action.replacement.text, textSha256: action.replacement.textSha256 });
  assert.equal(newValues[1].text, query.independentQuery);
  assert.equal(newValues[1].textSha256, sha256(query.independentQuery));
  assert.deepEqual(settings.retrievalAfter.where, query.whereAfterCurrentIndex);
  assert.equal(settings.counts.maximumAllHttp, 3); assert.equal(settings.answer.maxRetries, 0); assert.equal(settings.embedding.maxRetries, 0);
  assert.equal(settings.embedding.maxParallelCalls, 1); assert.equal(settings.embedding.dimensions, 1024);
  assert.equal(settings.answer.model, 'qwen-plus-2025-12-01');
  assert.equal(prompts.B.messagesAssembly[0].content, query.initialUserQuestion);
  const proposed = prompts.B.messagesAssembly[2].contentPrefix + prompts.B.possibleSourceMapping.map(sourceText).join('\n\n');
  assert.equal(proposed, prompts.B.completeUserMessageIfBothKnownBlocksAreActuallyReturned);
  return { ...material, inputFiles, sourceMap };
}

export function assembleFollowup(material, actualTextA, actualFusion) {
  // 只把实际集合中的块附进提示，不用设计提案补回未命中的来源。
  const sources = actualFusion.map(row => material.sourceMap.get(row.id));
  for (const source of sources) assert(source, '当前候选须有本轮对应的完整来源快照');
  sources.sort((a, b) => a.docId < b.docId ? -1 : a.docId > b.docId ? 1 : 0);
  return { sources, messages: [material.prompts.B.messagesAssembly[0],
    { role: 'assistant', content: actualTextA },
    { role: 'user', content: material.prompts.B.messagesAssembly[2].contentPrefix + sources.map(sourceText).join('\n\n') }] };
}

export function inspectSourceLabels(text, sources) {
  const labels = [...new Set([...text.matchAll(/\[([A-Za-z]+-v\d+)\]/g)].map(match => match[1]))];
  return { labels, references: labels.map(label => ({ label, mapped: sources.some(source => source.label === label) })),
    semanticReview: 'needs_human', scope: '只核标签能否对应实际输入快照；不证明陈述得到原文支持或回答已采用。' };
}
