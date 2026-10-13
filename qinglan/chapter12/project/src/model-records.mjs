import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { generateText, embedMany } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { sha256 } from './materials.mjs';
import { readSharedConfig } from './config.mjs';

export const describeError = error => ({ name: error.name, message: String(error.message), statusCode: error.statusCode ?? null });
export function recorder(run, report) {
  const config = readSharedConfig();
  const save = () => {
    const value = JSON.stringify(report, null, 2) + '\n';
    fs.writeFileSync(path.join(run.directory, 'report.json'), config.apiKey ? value.replaceAll(config.apiKey, '[凭据未记录]') : value);
  };
  let active;
  const provider = createOpenAICompatible({ name: 'compatible', baseURL: config.baseUrl, apiKey: config.apiKey, fetch: async (url, init) => {
    // 保存正文与实际入口次数，认证头及响应头不进入记录。
    const item = { url: String(url), method: init.method, requestBody: typeof init.body === 'string' ? init.body : null, startedAt: new Date().toISOString(), actualFetchAttempt: false };
    active.http.push(item); save();
    try {
      item.actualFetchAttempt = true; report.actualHttpRequests++; active.actualHttpRequests++; save();
      const response = await fetch(url, init); item.status = response.status; item.responseBody = await response.clone().text(); item.finishedAt = new Date().toISOString(); save(); return response;
    } catch (error) { item.error = describeError(error); item.finishedAt = new Date().toISOString(); save(); throw error; }
  } });
  function phase(input) { const record = { input, http: [], actualHttpRequests: 0, status: 'started', startedAt: new Date().toISOString() }; active = record; return record; }
  async function answer(record) {
    active = record; report.textTasks++; record.model = config.model; save();
    try {
      readSharedConfig('text');
      const result = await generateText({ model: provider.chatModel(config.model), instructions: record.input.system, messages: record.input.messages,
        temperature: 0, maxOutputTokens: 4096, maxRetries: 0, abortSignal: AbortSignal.timeout(180000), telemetry: { isEnabled: false } });
      record.result = { text: result.text, content: result.content, finishReason: result.finishReason, rawFinishReason: result.rawFinishReason,
        usage: result.usage, totalUsage: result.totalUsage, warnings: result.warnings ?? [], providerMetadata: result.providerMetadata ?? null,
        responseMessages: result.responseMessages, request: { body: result.finalStep.request?.body ?? null },
        response: { id: result.finalStep.response.id, modelId: result.finalStep.response.modelId, timestamp: result.finalStep.response.timestamp, body: result.finalStep.response.body ?? null },
        finalStep: { content: result.finalStep.content, finishReason: result.finalStep.finishReason, rawFinishReason: result.finalStep.rawFinishReason, usage: result.finalStep.usage, warnings: result.finalStep.warnings ?? [] } };
      record.status = 'returned';
    } catch (error) { record.error = describeError(error); record.status = 'failed'; }
    record.finishedAt = new Date().toISOString(); save(); return record.result;
  }
  async function embeddings(record) {
    active = record; report.embeddingTasks++; record.model = config.embeddingModel; save();
    try {
      readSharedConfig('embedding');
      const model = provider.embeddingModel(config.embeddingModel);
      record.sdkBatchLimit = await model.maxEmbeddingsPerCall;
      const result = await embedMany({ model, values: record.input.values.map(value => value.text), maxRetries: 0, maxParallelCalls: 1,
        abortSignal: AbortSignal.timeout(180000), telemetry: { isEnabled: false } });
      record.result = { values: result.values, embeddings: result.embeddings, usage: result.usage, warnings: result.warnings ?? [], providerMetadata: result.providerMetadata ?? null,
        responses: result.responses?.map(response => response ? { body: response.body ?? null } : null) ?? [] };
      save(); assert.deepEqual(result.values, record.input.values.map(value => value.text)); assert.equal(result.embeddings.length, result.values.length);
      const dimensions = result.embeddings[0]?.length;
      assert(dimensions > 0); for (const vector of result.embeddings) assert(vector.length === dimensions && vector.every(Number.isFinite));
      record.embeddings = record.input.values.map((value, index) => ({ ...value, embedding: result.embeddings[index] }));
      record.dimensions = dimensions; record.status = 'returned';
    } catch (error) { record.error = describeError(error); record.status = 'failed'; }
    record.finishedAt = new Date().toISOString(); save(); return record.embeddings;
  }
  return { config, save, phase, answer, embeddings };
}
export function sourceText(source) {
  return `来源标签：[${source.label}]\n资料ID：${source.docId}\n版本：${source.version}\n块ID：${source.blockId}\n位置：${source.source.fileName}，第${source.source.lineRange[0]}—${source.source.lineRange[1]}行\n正文SHA256：${source.textSha256}\n完整正文：\n${source.text}`;
}
export const requestHash = input => sha256(JSON.stringify(input));
