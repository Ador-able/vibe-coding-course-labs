import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { embedMany } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { root, loadMaterials, sha256, git, writeJson } from '../src/materials.mjs';

const material = loadMaterials(), { settings, values, inputFiles } = material;
const runId = randomUUID(), dir = path.join(root, 'runs', 'embeddings-' + runId);
fs.mkdirSync(dir, { recursive: true });
const report = { runId, startedAt: new Date().toISOString(), command: [process.execPath, ...process.argv.slice(1)],
  gitHead: git(['rev-parse', 'HEAD']), gitStatus: git(['status', '--porcelain=v1', '--untracked-files=all']),
  node: process.version, lockSHA256: sha256(fs.readFileSync(path.join(root, 'pnpm-lock.yaml'))),
  inputFiles, settings, values, batches: [], embeddings: [], completed: false,
  answerCalls: 0, pdfParseCalls: 0, rerankCalls: 0, actualBill: null,
  headerScope: '保存HTTP正文与SDK values/向量/usage/warnings/providerMetadata；SDK responses只投影body，不保存请求或响应头、Authorization。',
  requestCountScope: 'actualHttpRequests是实际进入原生fetch的尝试次数；另记wrapperCalls，不据调用证明服务器已收到。' };
let requests = 0, wrapperCalls = 0, currentBatch, apiKey;
// 密钥仅由启动进程提供；不读取凭据文件或把错误对象里的请求头写入记录。
const save = () => {
  const text = JSON.stringify(report, null, 2) + '\n';
  fs.writeFileSync(path.join(dir, 'report.json'), apiKey ? text.replaceAll(apiKey, '[凭据未记录]') : text);
};
const describeError = e => ({ name: e.name, message: String(e.message), statusCode: e.statusCode ?? null });
try {
  apiKey = process.env.API_KEY;
  assert(process.env.API_BASE_URL && process.env.EMBEDDING_MODEL, '请先在请求观察室保存服务地址和支持向量化的模型，再通过共用入口启动。');
  settings.semantic.baseURL=process.env.API_BASE_URL;
  settings.semantic.model=process.env.EMBEDDING_MODEL;
  assert(apiKey, '当前进程须提供API_KEY，脚本不读取凭据文件');
  const provider = createOpenAICompatible({ name: 'compatible', baseURL: settings.semantic.baseURL, apiKey,
    fetch: async (url, options) => {
      wrapperCalls++; assert(wrapperCalls <= 3, '本轮只允许三个自然fetch入口调用');
      currentBatch.http = { startedAt: new Date().toISOString(), url: String(url), method: options.method,
        requestBody: String(options.body), actualFetchAttempt: false, responseStatus: null, responseBody: null, error: null };
      save();
      const request = JSON.parse(currentBatch.http.requestBody);
      assert.equal(request.model, settings.semantic.model);
      assert.equal(request.dimensions, settings.semantic.dimensions);
      assert.deepEqual(request.input, currentBatch.inputs.map(x => x.text));
      try {
        requests++; currentBatch.http.actualFetchAttempt = true;
        currentBatch.http.fetchStartedAt = new Date().toISOString(); save();
        const response = await fetch(url, options);
        currentBatch.http.responseStatus = response.status;
        currentBatch.http.responseBody = await response.clone().text();
        currentBatch.http.finishedAt = new Date().toISOString(); save();
        return response;
      } catch (e) {
        currentBatch.http.error = describeError(e); currentBatch.http.finishedAt = new Date().toISOString(); save(); throw e;
      }
    } });
  for (let start = 0; start < values.length; start += settings.semantic.batchSize) {
    currentBatch = { index: report.batches.length + 1, start, inputs: values.slice(start, start + settings.semantic.batchSize),
      startedAt: new Date().toISOString(), http: null, sdk: null, error: null };
    report.batches.push(currentBatch); save();
    try {
      const result = await embedMany({ model: provider.embeddingModel(settings.semantic.model),
        values: currentBatch.inputs.map(x => x.text), maxRetries: 0, maxParallelCalls: 1,
        providerOptions: { compatible: { dimensions: settings.semantic.dimensions } },
        abortSignal: AbortSignal.timeout(settings.semantic.timeoutMs), telemetry: { isEnabled: false } });
      // 完整正文和向量另存；SDK响应只投影body，省略headers。
      currentBatch.sdk = { values: result.values, embeddings: result.embeddings, usage: result.usage,
        warnings: result.warnings, providerMetadata: result.providerMetadata ?? null,
        responses: result.responses?.map(x => x ? { body: x.body } : null) ?? [] };
      currentBatch.finishedAt = new Date().toISOString(); save();
      assert.equal(result.embeddings.length, currentBatch.inputs.length);
      assert.deepEqual(result.values, currentBatch.inputs.map(x => x.text));
      const response = JSON.parse(currentBatch.http.responseBody);
      assert.equal(response.data.length, currentBatch.inputs.length);
      assert.equal(new Set(response.data.map(x => x.index)).size, currentBatch.inputs.length);
      for (let i = 0; i < currentBatch.inputs.length; i++) {
        const vector = result.embeddings[i];
        assert.equal(vector.length, settings.semantic.dimensions); assert(vector.every(Number.isFinite));
        assert.deepEqual(vector, response.data.find(x => x.index === i)?.embedding, '原HTTP索引与SDK输入顺序须一致');
        report.embeddings.push({ ...currentBatch.inputs[i], embedding: vector });
      }
    } catch (e) {
      currentBatch.error = describeError(e); currentBatch.finishedAt = new Date().toISOString(); throw e;
    } finally { save(); }
  }
  assert.equal(requests, 3); assert.equal(report.embeddings.length, 25); report.completed = true;
} catch (e) {
  report.error = describeError(e); process.exitCode = 1;
} finally {
  report.actualHttpRequests = requests; report.wrapperCalls = wrapperCalls;
  report.finishedAt = new Date().toISOString(); save();
  const bytes = fs.readFileSync(path.join(dir, 'report.json'));
  writeJson(path.join(dir, 'record-bytes.json'), { name: 'report.json', bytes: bytes.length, sha256: sha256(bytes) });
  process.stdout.write(JSON.stringify({ runId, completed: report.completed, requests, reportPath: path.join(dir, 'report.json') }) + '\n');
}
