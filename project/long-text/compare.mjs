import { generateText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const runDir = resolve(root, process.argv[2] ?? 'runs/my-comparison-01');
const { API_KEY: apiKey, MODEL: modelId, API_BASE_URL: baseURL } = process.env;
if (!apiKey || !modelId || !baseURL) throw new Error('请通过共用 scripts/run-lab.mjs 启动，先在请求观察室保存模型设置。');
const settings = { modelId, baseURL, temperature: 0, maxOutputTokens: 2048, maxRetries: 0, };
const sha = value => createHash('sha256').update(value).digest('hex');
const texts = {};
for (const name of ['instructions', 'goal', 'whole', 'map', 'reduce', 'refine-first', 'refine-next']) texts[name] = await readFile(join(root, 'prompts', name + '.txt'), 'utf8');
const metadata = await readFile(join(root, 'inputs/metadata.txt'), 'utf8');
const chapters = await Promise.all([1, 2, 3].map(i => readFile(join(root, `inputs/chapter-${i}.txt`), 'utf8')));
// 一次固定处理流程保留一个独立目录，不覆盖旧实验，也不自动重试。
await mkdir(dirname(runDir), { recursive: true });
await mkdir(runDir);
await mkdir(join(runDir, 'calls'));
const startedAt = new Date().toISOString();
const runStarted = performance.now();
const calls = [];
const methods = [];
const fill = (template, values) => template.replace(/\{(goal|metadata|materials|previous|chapter)\}/g, (_, key) => values[key]);
const supplied = { goal: texts.goal, metadata };
let requestCount = 0;

async function invoke(id, prompt, materialScope) {
  const dir = join(runDir, 'calls', id);
  await mkdir(dir);
  const record = { id, materialScope, promptSha256: sha(prompt), startedAt: new Date().toISOString(), settings, http: [] };
  const begin = performance.now();
  await writeFile(join(dir, 'prompt.txt'), prompt);
  await writeFile(join(dir, 'instructions.txt'), texts.instructions);
  const provider = createOpenAICompatible({
    name: 'compatible', baseURL, apiKey, includeUsage: true,
    fetch: async (url, init) => {
      if (++requestCount > 8) throw new Error('超过固定八次请求范围。');
      const body = String(init.body);
      const exchange = { url: String(url), method: init.method, requestBody: body, requestAt: new Date().toISOString() };
      record.http.push(exchange);
      // 只记录发送体和返回体，不记录含身份信息的请求头。
      await writeFile(join(dir, 'request-body.json'), body);
      try {
        const response = await fetch(url, init);
        exchange.status = response.status;
        exchange.responseBody = await response.clone().text();
        exchange.responseAt = new Date().toISOString();
        await writeFile(join(dir, 'response-body.txt'), exchange.responseBody);
        return response;
      } catch (error) {
        exchange.error = { name: error.name, message: error.message };
        throw error;
      }
    }
  });
  try {
    const result = await generateText({ model: provider(modelId), instructions: texts.instructions, prompt, temperature: settings.temperature, maxOutputTokens: settings.maxOutputTokens, maxRetries: 0, providerOptions: { compatible: { } } });
    record.result = { text: result.text, finishReason: result.finishReason, rawFinishReason: result.rawFinishReason, usage: result.usage, warnings: result.warnings, response: { id: result.response.id, modelId: result.response.modelId, timestamp: result.response.timestamp } };
    await writeFile(join(dir, 'output.txt'), result.text);
    calls.push(record);
    return result.text;
  } catch (error) {
    // 失败保留在原节点；上游失败时不继续发依赖该结果的请求。
    record.error = { name: error.name, message: error.message };
    calls.push(record);
    throw error;
  } finally {
    record.endedAt = new Date().toISOString();
    record.elapsedMs = performance.now() - begin;
    await writeFile(join(dir, 'record.json'), JSON.stringify(record, null, 2) + '\n');
    console.log(JSON.stringify({ id, success: !!record.result, finishReason: record.result?.finishReason, elapsedMs: Math.round(record.elapsedMs) }));
  }
}

async function method(name, operation) {
  const begin = performance.now();
  const entry = { name, startedAt: new Date().toISOString() };
  methods.push(entry);
  try { const output = await operation(); entry.output = output; await writeFile(join(runDir, name + '.txt'), output); }
  catch (error) { entry.error = { name: error.name, message: error.message }; throw error; }
  finally { entry.endedAt = new Date().toISOString(); entry.elapsedMs = performance.now() - begin; }
}

let error;
try {
  await method('whole', () => invoke('01-whole', fill(texts.whole, { ...supplied, materials: chapters.join('\n\n') }), [1, 2, 3]));
  await method('map-reduce', async () => {
    // 先等三份独立结果全部终态，再决定是否能进入汇总。
    const maps = await Promise.allSettled(chapters.map((chapter, i) => invoke(`02-map-${i + 1}`, fill(texts.map, { ...supplied, materials: chapter }), [i + 1])));
    const failed = maps.find(x => x.status === 'rejected');
    if (failed) throw failed.reason;
    return invoke('03-reduce', fill(texts.reduce, { ...supplied, materials: maps.map((x, i) => `[第${i + 1}章的实际笔记]\n${x.value}`).join('\n\n') }), ['map-1', 'map-2', 'map-3']);
  });
  await method('refine', async () => {
    let previous = await invoke('04-refine-1', fill(texts['refine-first'], { ...supplied, materials: chapters[0] }), [1]);
    for (let i = 1; i < chapters.length; i++) previous = await invoke(`04-refine-${i + 1}`, fill(texts['refine-next'], { ...supplied, materials: chapters[i], previous, chapter: i + 1 }), ['previous-summary', i + 1]);
    return previous;
  });
} catch (cause) { error = { name: cause.name, message: cause.message }; process.exitCode = 1; }
finally {
  calls.sort((a, b) => a.id.localeCompare(b.id));
  const report = { startedAt, endedAt: new Date().toISOString(), elapsedMs: performance.now() - runStarted, requestCount, settings, calls, methods, error: error ?? null, scope: '八次固定摘要请求；没有 Agent 工具、业务保存或模型评分' };
  await writeFile(join(runDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
