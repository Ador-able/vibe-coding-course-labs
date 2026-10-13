import fs from 'node:fs';
import path from 'node:path';
import { generateText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { readSharedConfig } from './config.mjs';
import { sha256, replaceJson } from './files.mjs';

export function modelRecorder(run, maximumRequests) {
  const config = readSharedConfig(true);
  const publicError = error => ({ name: error.name, message: String(error.message).replaceAll(config.apiKey, '[凭据未记录]'), statusCode: error.statusCode ?? null });
  return async function answer(id, input, maxOutputTokens, materialScope) {
    const begin = performance.now();
    const directory = path.join(run.directory, id); fs.mkdirSync(directory);
    const settings = { modelId: config.model, baseURL: config.baseUrl, temperature: 0, maxOutputTokens, maxRetries: 0 };
    const record = { id, input, materialScope, settings, inputSHA256: sha256(JSON.stringify(input)), startedAt: new Date().toISOString(), actualHttpRequests: 0, http: [], status: 'started' };
    run.report.calls.push(record); run.report.textTasks++;
    const save = () => { replaceJson(path.join(directory, 'record.json'), record); run.save(); };
    fs.writeFileSync(path.join(directory, 'instructions.txt'), input.instructions, { flag: 'wx' });
    fs.writeFileSync(path.join(directory, 'prompt.txt'), input.prompt, { flag: 'wx' }); save();
    const provider = createOpenAICompatible({ name: 'compatible', baseURL: config.baseUrl, apiKey: config.apiKey, includeUsage: true, fetch: async (url, init) => {
      if (record.actualHttpRequests || run.report.actualHttpRequests >= maximumRequests) throw new Error('超过本轮已冻结的真实请求范围。');
      const body = String(init.body);
      fs.writeFileSync(path.join(directory, 'request-body.json'), body, { flag: 'wx' });
      const exchange = { url: String(url), method: init.method, requestBody: body, requestSHA256: sha256(body), startedAt: new Date().toISOString() };
      record.http.push(exchange); record.actualHttpRequests++; run.report.actualHttpRequests++; save();
      // 每个并发任务持有自己的记录对象，认证头和响应头不进入实录。
      try {
        const response = await fetch(url, init); exchange.status = response.status; exchange.responseBody = await response.clone().text(); exchange.responseSHA256 = sha256(exchange.responseBody);
        fs.writeFileSync(path.join(directory, 'response-body.txt'), exchange.responseBody, { flag: 'wx' }); exchange.finishedAt = new Date().toISOString(); save(); return response;
      } catch (error) { exchange.error = publicError(error); exchange.finishedAt = new Date().toISOString(); save(); throw error; }
    } });
    try {
      const result = await generateText({ model: provider.chatModel(config.model), instructions: input.instructions, prompt: input.prompt,
        temperature: 0, maxOutputTokens, maxRetries: 0, abortSignal: AbortSignal.timeout(180000), telemetry: { isEnabled: false } });
      const final = result.finalStep;
      record.result = { text: result.text, content: final.content, finishReason: final.finishReason, rawFinishReason: final.rawFinishReason,
        usage: result.usage, totalUsage: result.totalUsage, warnings: result.warnings ?? [], providerMetadata: result.providerMetadata ?? null,
        responseMessages: result.responseMessages, response: { id: final.response.id, modelId: final.response.modelId, timestamp: final.response.timestamp } };
      fs.writeFileSync(path.join(directory, 'output.txt'), result.text, { flag: 'wx' }); record.status = 'returned';
      return record;
    } catch (error) { record.status = 'failed'; record.error = publicError(error); throw Object.assign(new Error(record.error.message), { name: record.error.name }); }
    finally { record.finishedAt = new Date().toISOString(); record.elapsedMs = performance.now() - begin; save(); console.log(JSON.stringify({ id, status: record.status, actualHttpRequests: record.actualHttpRequests, finishReason: record.result?.finishReason })); }
  };
}
