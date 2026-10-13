import fs from 'node:fs';
import path from 'node:path';
import { root, sha256, writeNew } from '../src/files.mjs';
import { teaching } from '../src/teaching.mjs';
import assert from 'node:assert/strict';
import { generateText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const material = teaching(), name = process.argv[2];
if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name || '')) throw new Error('请提供新的预览记录名。');
const directory = path.join(root, 'records/previews', name); fs.mkdirSync(path.dirname(directory), { recursive: true }); fs.mkdirSync(directory);
const calls = [];
const add = (id, input, budget, scope) => calls.push({ id, input, inputSHA256: sha256(JSON.stringify(input)), maxOutputTokens: budget, temperature: 0, maxRetries: 0, thinking: material.settings.thinking, materialScope: scope });
add('long/01-whole', material.longInput('whole', { materials: [1, 2, 3].map(material.longChapter).join('\n\n') }), material.settings.maxOutputTokens.longText, ['C1', 'C2', 'C3']);
for (const n of [1, 2, 3]) add(`long/02-map-${n}`, material.longInput('map', { materials: material.longChapter(n) }), material.settings.maxOutputTokens.longText, [`C${n}`]);
add('long/04-refine-1', material.longInput('refine-first', { materials: material.longChapter(1) }), material.settings.maxOutputTokens.longText, ['C1']);
for (const stage of ['discovery', 'v1', 'v2']) for (const n of [0, 1]) add(`classification-${stage}/batch-${n + 1}`, material.labelInput(stage, n), material.settings.maxOutputTokens.classification, material.labels.batches[n]);
add('extraction/extract', material.extractionInput, material.settings.maxOutputTokens.extraction, material.logs.scope.extraction);
for (const version of ['V1', 'V2']) add(`templates/${version}`, material.templateInput(version), material.settings.maxOutputTokens.templateComparison, material.logs.scope.templateComparison);
for (const id of ['R01', 'R06']) add(`repairs/repair-${id}`, { instructions: material.files['抽取-共同规则.txt'], prompt: material.files[`逐项-完整任务-${id}.txt`] }, material.settings.maxOutputTokens.itemRepair, [id]);
for (const call of calls) {
  let serialized = 0;
  const provider = createOpenAICompatible({ name: 'compatible', baseURL: material.settings.providers.baseURL, apiKey: 'preview-only',
    transformRequestBody: body => ({ ...body, thinking: call.thinking }), fetch: async (_url, init) => {
    serialized++; call.requestBody = String(init.body); call.requestSHA256 = sha256(call.requestBody);
    throw new Error('仅采集SDK序列化正文，未进入HTTP。');
  } });
  try { await generateText({ model: provider.chatModel(material.settings.providers.textModelAlias), instructions: call.input.instructions, prompt: call.input.prompt,
    temperature: 0, maxOutputTokens: call.maxOutputTokens, maxRetries: 0, telemetry: { isEnabled: false } }); }
  catch (error) { if (!call.requestBody) throw error; }
  assert.equal(serialized, 1); const request = JSON.parse(call.requestBody);
  assert.deepEqual(request.messages, [{ role: 'system', content: call.input.instructions }, { role: 'user', content: call.input.prompt }]);
  assert.equal(request.max_tokens, call.maxOutputTokens); assert.equal(request.temperature, 0);
  assert.deepEqual(request.thinking, material.settings.thinking); assert.equal(request.thinking.type, 'disabled');
}
const dependencies = [
  { id: 'long/03-reduce', requires: ['02-map-1', '02-map-2', '02-map-3'], template: material.files['长文-reduce.txt'] },
  { id: 'long/04-refine-2', requires: ['04-refine-1', 'C2'], template: material.files['长文-refine-next.txt'] },
  { id: 'long/04-refine-3', requires: ['04-refine-2', 'C3'], template: material.files['长文-refine-next.txt'] }
];
writeNew(path.join(directory, 'preview.json'), { inputs: material.registry.files, fixedRequests: calls, deferredRequests: dependencies, totalPlannedTextRequests: calls.length + dependencies.length,
  scope: '零调用预览。三个依赖请求必须取得本轮实际前序结果后逐字构建；不以占位文字冒充实际输入。SDK实际发送体在每次提供方请求前另存，不记录认证头。', modelCalls: 0 });
console.log(JSON.stringify({ directory: path.relative(root, directory), fixedRequests: calls.length, deferredRequests: dependencies.length, totalPlannedTextRequests: calls.length + dependencies.length, modelCalls: 0 }));
