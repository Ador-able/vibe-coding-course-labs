import { generateText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const stage = process.argv[2];
if (!['discovery', 'v1', 'v2'].includes(stage)) throw new Error('请选择 discovery、v1 或 v2。');
const runDir = resolve(root, process.argv[3] ?? 'runs/my-' + stage + '-01');
const {API_KEY:apiKey,MODEL:modelId,API_BASE_URL:baseURL}=process.env;
if(!apiKey||!modelId||!baseURL)throw new Error('请通过仓库根 scripts/run-lab.mjs 启动，沿用请求观察室的模型设置。');
const settings = { modelId, baseURL, temperature: 0, maxOutputTokens: 4096, maxRetries: 0, };
const sha = value => createHash('sha256').update(value).digest('hex');
const source = await readFile(join(root, 'inputs/records.json'), 'utf8');
const { records } = JSON.parse(source);
const instructions = await readFile(join(root, 'prompts/instructions.txt'), 'utf8');
const template = await readFile(join(root, 'prompts/' + (stage === 'discovery' ? 'discover' : 'classify') + '.txt'), 'utf8');
const codebook = stage === 'discovery' ? '' : await readFile(join(root, 'inputs/codebook-' + stage + '.json'), 'utf8');
if (codebook && JSON.parse(codebook).version !== stage) throw new Error('标签口径版本不匹配。');
// 一个阶段只处理已固定的两批；人读回结果后才决定下一阶段口径。
await mkdir(dirname(runDir), { recursive: true });
await mkdir(runDir);
const startedAt = new Date().toISOString();
const calls = [];
let requestCount = 0;
let error;
for (let i = 0; i < 2; i++) {
  const batch = records.slice(i * 6, (i + 1) * 6);
  const prompt = template.replace(/\{(records|codebook|version)\}/g, (_, key) => ({ records: JSON.stringify(batch, null, 2), codebook, version: stage })[key]);
  const callDir = join(runDir, 'batch-' + (i + 1));
  await mkdir(callDir);
  await writeFile(join(callDir, 'prompt.txt'), prompt);
  await writeFile(join(callDir, 'instructions.txt'), instructions);
  const entry = { id: 'batch-' + (i + 1), recordIds: batch.map(x => x.id), promptSha256: sha(prompt), startedAt: new Date().toISOString(), http: [] };
  const begin = performance.now();
  const provider = createOpenAICompatible({
    name: 'compatible', baseURL: settings.baseURL, apiKey,
    fetch: async (url, init) => {
      if (++requestCount > 2) throw new Error('超过本阶段固定两次请求。');
      const body = String(init.body);
      const exchange = { url: String(url), method: init.method, requestBody: body, requestAt: new Date().toISOString() };
      entry.http.push(exchange);
      // 只保存教师发送体和返回体，不保存含凭据的请求头。
      await writeFile(join(callDir, 'request-body.json'), body);
      try {
        const response = await fetch(url, init);
        exchange.status = response.status;
        exchange.responseBody = await response.clone().text();
        exchange.responseAt = new Date().toISOString();
        await writeFile(join(callDir, 'response-body.txt'), exchange.responseBody);
        return response;
      } catch (cause) {
        exchange.error = { name: cause.name, message: cause.message };
        throw cause;
      }
    }
  });
  try {
    const result = await generateText({
      model: provider(settings.modelId), instructions, prompt, temperature: settings.temperature,
      maxOutputTokens: settings.maxOutputTokens, maxRetries: 0,
      providerOptions: { compatible: { } }
    });
    entry.result = { text: result.text, finishReason: result.finishReason, rawFinishReason: result.rawFinishReason, usage: result.usage, warnings: result.warnings, response: { id: result.response.id, modelId: result.response.modelId, timestamp: result.response.timestamp } };
    await writeFile(join(callDir, 'output.txt'), result.text);
  } catch (cause) {
    entry.error = { name: cause.name, message: cause.message };
    error = entry.error;
    process.exitCode = 1;
  } finally {
    entry.endedAt = new Date().toISOString();
    entry.elapsedMs = performance.now() - begin;
    calls.push(entry);
    await writeFile(join(callDir, 'record.json'), JSON.stringify(entry, null, 2) + '\n');
    console.log(JSON.stringify({ stage, batch: i + 1, returned: !!entry.result, finishReason: entry.result?.finishReason, elapsedMs: Math.round(entry.elapsedMs) }));
  }
  if (error) break;
}
const report = { stage, startedAt, endedAt: new Date().toISOString(), settings, sourceSha256: sha(source), instructionsSha256: sha(instructions), templateSha256: sha(template), codebookSha256: codebook ? sha(codebook) : null, requestCount, calls, error: error ?? null, scope: '每阶段两批完整材料；没有模型工具、业务写入、自动改口径或重试' };
await writeFile(join(runDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');

