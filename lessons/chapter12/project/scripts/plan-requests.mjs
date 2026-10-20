import path from 'node:path';
import assert from 'node:assert/strict';
import { generateText, embedMany } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { root, readJson, writeJson, sha256, loadMaterials, loadFrozen } from '../src/materials.mjs';
import { checkSource, checkTeaching } from '../src/frozen.mjs';
import { readSharedConfig } from '../src/config.mjs';
import { sourceText } from '../src/model-records.mjs';

const mode = process.argv[2] || 'initial';
const sourceVersion = checkSource(); const teachingFreeze = checkTeaching(); const config = readSharedConfig();
const preview = { previewOnly: true, actualHttpRequests: 0, textModelCalls: 0, embeddingModelCalls: 0, sourceVersion, teachingFreeze, requests: [], dynamicB: null };
let active;
const provider = createOpenAICompatible({ name: 'compatible', baseURL: config.baseUrl, apiKey: config.apiKey,
  fetch: async (url, init) => { active.push({ url: String(url), method: init.method, requestBody: String(init.body), bodySha256: sha256(String(init.body)), sent: false }); throw new Error('PREVIEW_ONLY_NO_NETWORK'); } });
async function plannedAnswer(name, input) {
  const row = { name, kind: 'text', input, sdkBodies: [] }; preview.requests.push(row); active = row.sdkBodies;
  try { await generateText({ model: provider.chatModel(config.model), instructions: input.system, messages: input.messages, maxOutputTokens: 4096, temperature: 0, maxRetries: 0 }); } catch { /* fetch入口截住请求，未向网络发送。 */ }
  assert(row.sdkBodies.length > 0, `SDK尚未生成${name}请求`);
}
async function plannedEmbedding(name, values) {
  const model = provider.embeddingModel(config.embeddingModel);
  const row = { name, kind: 'embedding', values, model: config.embeddingModel, sdkBatchLimit: await model.maxEmbeddingsPerCall, sdkBodies: [] }; preview.requests.push(row); active = row.sdkBodies;
  try { await embedMany({ model, values: values.map(value => value.text), maxRetries: 0, maxParallelCalls: 1 }); } catch { /* 首个实际fetch入口只记录序列化正文。 */ }
  assert(row.sdkBodies.length > 0, 'SDK尚未生成向量请求');
  row.remainingInputsScope = values.length > row.sdkBatchLimit ? 'SDK首批序列化已保存，余批输入完整列于values；实际执行另记全部自然fetch。' : '全部输入属于SDK首批。';
}
const rules = readJson(path.join(root, 'inputs/实验规则.json'));
if (mode === 'initial') {
  const chunks = readJson(path.join(root, 'public/records/chunks.json'));
  for (const method of chunks.methods) {
    const selected = method.retrievals.find(row => row.term === rules.chunkTerm);
    await plannedAnswer(method.condition.id, { system: rules.chunkSystem, messages: [{ role: 'user', content: `资料：\n${selected.context}\n\n问题：\n${rules.chunkQuestion}` }] });
  }
  await plannedEmbedding('initial-corpus-and-queries', loadMaterials().values);
} else if (mode === 'update') {
  const material = loadFrozen('update').read('material.json');
  const content = `问题：\n${material.query.questionA}\n\n本轮实际检索的完整来源：\n${material.prompts.sourcesA.map(sourceText).join('\n\n')}`;
  await plannedAnswer('A', { system: material.prompts.system, messages: [{ role: 'user', content }] });
  await plannedEmbedding('replacement-and-queryB', material.newValues);
  preview.dynamicB = { system: material.prompts.system, initialUserMessage: material.query.questionA, followUp: material.query.followUp,
    independentQuery: material.query.independentQuery, teacherAssembly: material.bAssembly,
    exactBodyKnown: false, reason: 'A实际完整回答和新增向量的实际检索尚未产生，B完整序列化正文在实际fetch前写入原记录，不用占位结果冒充冻结请求。' };
} else throw new Error('只支持 initial 或 update。');
writeJson(path.join(root, 'inputs', `request-preview-${mode}.json`), preview);
console.log(JSON.stringify({ previewOnly: true, mode, record: `inputs/request-preview-${mode}.json`, textInputs: preview.requests.filter(row => row.kind === 'text').length,
  embeddingInputs: preview.requests.filter(row => row.kind === 'embedding').map(row => row.values.length), actualHttpRequests: 0, sourceVersion: sourceVersion.sourceVersion }));
