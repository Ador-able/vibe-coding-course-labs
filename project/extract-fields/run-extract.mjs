import { generateText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const runDir = resolve(root, process.argv[2] ?? 'runs/my-extract-01');
const { API_KEY: apiKey, MODEL: modelId, API_BASE_URL: baseURL } = process.env;
if (!apiKey || !modelId || !baseURL) throw new Error('请通过共用 scripts/run-lab.mjs 启动，先在请求观察室保存模型设置。');
const settings = { modelId, baseURL, temperature: 0, maxOutputTokens: 6144, maxRetries: 0, };
const sha = text => createHash('sha256').update(text).digest('hex');
const source = await readFile(join(root, 'inputs/reports.json'), 'utf8');
const reference = await readFile(join(root, 'inputs/teacher-reference.json'), 'utf8');
const instructions = await readFile(join(root, 'prompts/instructions.txt'), 'utf8');
const prompt = await readFile(join(root, 'prompts/task.txt'), 'utf8');
// 新目录不会覆盖已有实验。没有第二次请求或自动补救。
await mkdir(dirname(runDir), { recursive: true });
await mkdir(runDir);
await writeFile(join(runDir, 'prompt.txt'), prompt);
await writeFile(join(runDir, 'instructions.txt'), instructions);
const report = { startedAt: new Date().toISOString(), settings, sourceSHA256: sha(source), referenceSHA256: sha(reference), instructionsSHA256: sha(instructions), promptSHA256: sha(prompt), requestCount: 0, http: [], result: null, error: null, scope: '一次完整抽取；无模型工具、业务写入、联网工具或自动重试' };
const begin = performance.now();
const provider = createOpenAICompatible({
  name: 'compatible', baseURL: settings.baseURL, apiKey,
  fetch: async (url, init) => {
    if (++report.requestCount > 1) throw new Error('本轮仅允许一次请求。');
    const requestBody = String(init.body);
    const exchange = { url: String(url), method: init.method, requestBody, requestAt: new Date().toISOString() };
    report.http.push(exchange);
    // 记录发送体与返回体；请求头含凭据，不写入文件。
    await writeFile(join(runDir, 'request-body.json'), requestBody);
    try {
      const response = await fetch(url, init);
      exchange.status = response.status;
      exchange.responseBody = await response.clone().text();
      exchange.responseAt = new Date().toISOString();
      await writeFile(join(runDir, 'response-body.txt'), exchange.responseBody);
      return response;
    } catch (cause) {
      exchange.error = { name: cause.name, message: cause.message };
      throw cause;
    }
  }
});
try {
  const result = await generateText({
    model: provider(settings.modelId), instructions, prompt,
    temperature: settings.temperature, maxOutputTokens: settings.maxOutputTokens, maxRetries: 0,
    providerOptions: { compatible: { } }
  });
  report.result = { text: result.text, finishReason: result.finishReason, rawFinishReason: result.rawFinishReason, usage: result.usage, warnings: result.warnings, response: { id: result.response.id, modelId: result.response.modelId, timestamp: result.response.timestamp } };
  await writeFile(join(runDir, 'output.txt'), result.text);
} catch (cause) {
  report.error = { name: cause.name, message: cause.message };
  process.exitCode = 1;
} finally {
  report.endedAt = new Date().toISOString();
  report.elapsedMs = performance.now() - begin;
  await writeFile(join(runDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ requestCount: report.requestCount, status: report.http[0]?.status, returned: !!report.result, finishReason: report.result?.finishReason, elapsedMs: Math.round(report.elapsedMs), error: report.error }));
}

