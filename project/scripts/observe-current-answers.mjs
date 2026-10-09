import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateText, embedMany } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { root, git, readJson, writeJson, sha256 } from '../src/materials.mjs';
import { loadUpdateMaterials, assembleFollowup, inspectSourceLabels } from '../src/update-materials.mjs';
import { replaceCurrentSource, rankCurrentSource } from '../src/update-index.mjs';

const label = process.argv[2];
assert(label && /^[A-Za-z0-9_-]+$/.test(label), '显式指定唯一运行目录名，不自动选某次成功记录');
const dir = path.join(root, 'runs', label);
fs.mkdirSync(path.dirname(dir), { recursive: true });
assert.equal(fs.existsSync(dir), false, '已有运行目录不能覆盖或自动续发');
fs.mkdirSync(dir);
const runId = randomUUID();
const report = { runId, startedAt: new Date().toISOString(), command: [process.execPath, ...process.argv.slice(1)], cwd: process.cwd(),
  node: process.version, gitHead: null, gitStatus: null, inputFiles: [], settings: null,
  phases: { A: { status: 'not_started' }, embedding: { status: 'not_started' }, update: { status: 'not_started' }, B: { status: 'not_started' } },
  completed: false, semanticReview: 'needs_human', wrapperCalls: 0, actualHttpRequests: 0, actualBill: null,
  completionScope: 'completed只表示执行走到B返回；完整性需读finishReason，陈述支持与采用需人工判断。',
  scope: '直接SDK请求，人工传入必要历史；不是Harness恢复、生产事务、真人付款或章稿采用。',
  publicFields: '保存完整教师输入、HTTP请求/响应正文、SDK content/finalStep公开投影/responseMessages/usage；省略请求响应头和凭据，不称SDK整个对象原样保存。' };
let apiKey, material, activePhase;
const publicString = value => {
  const text = JSON.stringify(value, null, 2) + '\n';
  return apiKey ? text.replaceAll(apiKey, '[凭据未记录]') : text;
};
const save = () => fs.writeFileSync(path.join(dir, 'report.json'), publicString(report));
const savePublic = (name, value) => fs.writeFileSync(path.join(dir, name), publicString(value));
const describeError = error => ({ name: error.name, message: String(error.message), statusCode: error.statusCode ?? null });
function responseProjection(response) {
  return { id: response.id, modelId: response.modelId, timestamp: response.timestamp, body: response.body ?? null };
}
function stepProjection(step) {
  return { callId: step.callId, stepNumber: step.stepNumber, model: step.model, content: step.content, text: step.text,
    finishReason: step.finishReason, rawFinishReason: step.rawFinishReason, usage: step.usage,
    warnings: step.warnings ?? [], performance: step.performance, providerMetadata: step.providerMetadata ?? null,
    sources: step.sources, toolCalls: step.toolCalls, toolResults: step.toolResults,
    request: { body: step.request?.body ?? null }, response: responseProjection(step.response) };
}
function answerProjection(result) {
  return { text: result.text, content: result.content, finalStep: stepProjection(result.finalStep),
    responseMessages: result.responseMessages, usage: result.usage, finishReason: result.finishReason,
    rawFinishReason: result.rawFinishReason, warnings: result.warnings ?? [], providerMetadata: result.finalStep.providerMetadata ?? null,
    sources: result.sources, toolCalls: result.toolCalls, toolResults: result.toolResults,
    request: { body: result.finalStep.request?.body ?? null }, response: responseProjection(result.finalStep.response) };
}
function startPhase(name, input) {
  activePhase = report.phases[name];
  Object.assign(activePhase, { status: 'running', startedAt: new Date().toISOString(), input, http: [], error: null });
  savePublic(name + '-完整实际输入.json', input); save();
}
async function answer(name, input, provider) {
  startPhase(name, input);
  try {
    const result = await generateText({ model: provider.chatModel(material.settings.answer.model),
      instructions: input.system, messages: input.messages,
      maxRetries: 0, maxOutputTokens: material.settings.answer.maxOutputTokens,
      providerOptions: material.settings.answer.providerOptions,
      abortSignal: AbortSignal.timeout(material.settings.answer.timeoutMs), telemetry: { isEnabled: false } });
    activePhase.result = answerProjection(result); activePhase.status = 'returned';
    activePhase.referenceLabels = inspectSourceLabels(result.text, input.sources);
    activePhase.finishedAt = new Date().toISOString(); save();
    fs.writeFileSync(path.join(dir, name + '-实际完整回答.txt'), apiKey ? result.text.replaceAll(apiKey, '[凭据未记录]') : result.text);
    return result;
  } catch (error) {
    activePhase.error = describeError(error); activePhase.status = 'failed';
    activePhase.finishedAt = new Date().toISOString(); save(); throw error;
  }
}

try {
  save(); material = loadUpdateMaterials();
  report.gitHead = git(['rev-parse', 'HEAD']); report.gitStatus = git(['status', '--porcelain=v1', '--untracked-files=all']);
  report.inputFiles = material.inputFiles; report.settings = material.settings;
  report.lockSHA256 = sha256(fs.readFileSync(path.join(root, 'pnpm-lock.yaml')));
  report.previous = { embeddingRunId: material.previousEmbeddings.runId, retrievalRunId: material.previousCandidates.sourceObservationRunId,
    previousVectorsFile: 'inputs/update/14-既有25项真实向量与完整返回.json', priorCandidates: material.previousCandidates };
  apiKey = process.env.API_KEY;
  assert(process.env.API_BASE_URL && process.env.MODEL && process.env.EMBEDDING_MODEL, '请先在请求观察室保存服务地址、聊天模型和向量模型，再通过共用入口启动。');
  assert.equal(process.env.EMBEDDING_MODEL, material.previousEmbeddings.settings.semantic.model, '新增向量必须与既有向量属于同一模型；换向量模型须重建整个索引。');
  material.settings.baseURL=process.env.API_BASE_URL;
  material.settings.answer.model=process.env.MODEL;
  material.settings.answer.providerOptions={};
  material.settings.embedding.model=process.env.EMBEDDING_MODEL;
  material.settings.providerName='compatible';
  assert(apiKey, '只由当前进程提供API_KEY；程序不读取凭据文件');
  const provider = createOpenAICompatible({ name: material.settings.providerName, baseURL: material.settings.baseURL, apiKey,
    fetch: async (url, init) => {
      report.wrapperCalls++;
      const http = { url: String(url), method: init.method, requestBody: String(init.body), startedAt: new Date().toISOString(),
        actualFetchAttempt: false, responseStatus: null, responseBody: null, error: null };
      activePhase.http.push(http); save();
      try {
        assert(report.wrapperCalls <= material.settings.counts.maximumAllHttp, '本轮最多三个原生HTTP入口');
        assert.equal(activePhase.http.length, 1, '每个阶段只允许一个自然HTTP入口，不自动重试');
        const request = JSON.parse(http.requestBody);
        if (activePhase === report.phases.embedding) {
          assert.equal(request.model, material.settings.embedding.model);
          assert.equal(request.dimensions, material.settings.embedding.dimensions);
          assert.deepEqual(request.input, material.newValues.map(value => value.text));
        } else {
          assert.equal(request.model, material.settings.answer.model);
          assert.equal(request.max_tokens, material.settings.answer.maxOutputTokens);
          assert.deepEqual(request.messages.map(({ role, content }) => ({ role, content })),
            [{ role: 'system', content: activePhase.input.system }, ...activePhase.input.messages]);
        }
        report.actualHttpRequests++; http.actualFetchAttempt = true; http.fetchStartedAt = new Date().toISOString(); save();
        const response = await fetch(url, init);
        http.responseStatus = response.status; save();
        http.responseBody = await response.clone().text(); http.finishedAt = new Date().toISOString(); save();
        return response;
      } catch (error) {
        http.error = describeError(error); http.finishedAt = new Date().toISOString(); save(); throw error;
      }
    } });
  const A = await answer('A', { system: material.prompts.system, messages: material.prompts.A.messages,
    sources: material.prompts.A.sources, previousCandidates: material.previousCandidates }, provider);
  // 保留完整但有内容错误的A；只在无可用正文或长度限制时停止接续。
  assert(A.text.trim(), 'A没有可用完整正文，停止后续');
  assert.notEqual(A.finishReason, 'length', 'A受长度限制，停止后续，不补造历史');

  startPhase('embedding', { values: material.newValues, settings: material.settings.embedding });
  try {
    const embedded = await embedMany({ model: provider.embeddingModel(material.settings.embedding.model),
      values: material.newValues.map(value => value.text), maxRetries: 0, maxParallelCalls: 1,
      providerOptions: { compatible: { dimensions: material.settings.embedding.dimensions } },
      abortSignal: AbortSignal.timeout(material.settings.embedding.timeoutMs), telemetry: { isEnabled: false } });
    activePhase.sdk = { values: embedded.values, embeddings: embedded.embeddings, usage: embedded.usage,
      warnings: embedded.warnings ?? [], providerMetadata: embedded.providerMetadata ?? null,
      responses: embedded.responses?.map(response => response ? { body: response.body ?? null } : null) ?? [] };
    activePhase.status = 'returned'; activePhase.finishedAt = new Date().toISOString(); save();
    assert.deepEqual(embedded.values, material.newValues.map(value => value.text));
    assert.equal(embedded.embeddings.length, 2);
    const response = JSON.parse(activePhase.http[0].responseBody);
    assert.equal(response.data.length, 2);
    report.newEmbeddings = material.newValues.map((value, index) => {
      const vector = embedded.embeddings[index];
      assert.equal(vector.length, 1024); assert(vector.every(Number.isFinite));
      assert.deepEqual(vector, response.data.find(row => row.index === index)?.embedding);
      return { ...value, embedding: vector };
    });
    save();
  } catch (error) {
    activePhase.error = describeError(error); activePhase.status = 'failed'; activePhase.finishedAt = new Date().toISOString(); save(); throw error;
  }

  const index = await replaceCurrentSource(material, report.newEmbeddings, report.phases.update, save);
  const persisted = { providerName: material.settings.providerName, baseURL: material.settings.baseURL,
    model: material.settings.embedding.model, dimensions: 1024, current: index.current,
    currentVectors: index.currentVectors, archive: report.phases.update.archive,
    currentDocumentVersions: material.action.currentDocumentVersions };
  savePublic('current-index.json', persisted);
  const loaded = readJson(path.join(dir, 'current-index.json')); assert.deepEqual(loaded, persisted);
  report.phases.update.persisted = { name: 'current-index.json', bytes: fs.statSync(path.join(dir, 'current-index.json')).size,
    sha256: sha256(fs.readFileSync(path.join(dir, 'current-index.json'))), readonlyReloadSame: true }; save();
  report.ranking = await rankCurrentSource(material, index, report.newEmbeddings[1]); save();
  savePublic('完整当前检索.json', report.ranking);
  assert(report.ranking.fusion.all.length > 0, '当前候选为空：不发B，也不补回教师预期资料');
  const Binput = assembleFollowup(material, A.text, report.ranking.fusion.all);
  await answer('B', { system: material.prompts.system, ...Binput, followUp: material.query.followUp,
    independentQuery: material.query.independentQuery, queryAuthor: material.query.queryAuthor,
    actualRanking: report.ranking }, provider);
  report.completed = true;
} catch (error) {
  report.error = describeError(error); process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString(); save();
  const bytes = fs.readFileSync(path.join(dir, 'report.json'));
  writeJson(path.join(dir, 'record-bytes.json'), { name: 'report.json', bytes: bytes.length, sha256: sha256(bytes),
    scope: '完整实际业务记录的公开字段；请求响应头与凭据未收录。' });
  process.stdout.write(JSON.stringify({ runId, report: path.join(dir, 'report.json'), completed: report.completed,
    wrapperCalls: report.wrapperCalls, actualHttpRequests: report.actualHttpRequests, semanticReview: report.semanticReview,
    error: report.error ?? null }) + '\n');
}
