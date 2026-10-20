import path from 'node:path';
import assert from 'node:assert/strict';
import { root, readJson, writeJson, sha256, loadMaterials } from '../src/materials.mjs';
import { checkTeaching } from '../src/frozen.mjs';

const teachingFreeze = checkTeaching(); const material = loadMaterials();
const embeddings = readJson(path.join(root, 'public/records/embeddings.json'));
const retrieval = readJson(path.join(root, 'public/records/retrieval.json'));
assert.equal(embeddings.completed, true); assert.equal(retrieval.embeddingRunId, embeddings.runId);
const draft = readJson(path.join(root, 'inputs/update/draft.json'));
const rules = readJson(path.join(root, 'inputs/实验规则.json'));
const oldBlock = material.corpus.find(row => row.docId === draft.replacement.docId && row.version === 'v1');
assert(oldBlock); const after = material.corpus.map(row => row.id === oldBlock.id ? draft.replacement : row);
const previousRanking = retrieval.cases.find(row => row.id === 'Q2-filtered'); assert(previousRanking);
const sourcesA = previousRanking.fusion.top.slice(0, 2).map(row => row.document); assert(sourcesA.length, '当前实际候选为空，不能补入教师预期来源。');
const newValues = [
  { id: draft.replacement.id, role: 'document', text: draft.replacement.text, textSha256: draft.replacement.textSha256 },
  { id: 'Q2-current', role: 'query', text: draft.standaloneQueryB, textSha256: sha256(draft.standaloneQueryB) },
];
const update = { teachingFreeze, before: material.corpus, after, previousEmbeddings: embeddings,
  action: { oldBlock, replacement: draft.replacement, unchangedBlockIds: material.corpus.filter(row => row.id !== oldBlock.id).map(row => row.id),
    currentDocumentVersions: Object.fromEntries(after.map(row => [row.docId, row.version])) },
  query: { id: 'Q2-current', questionA: draft.questionA, followUp: draft.questionB, independentQuery: draft.standaloneQueryB,
    queryAuthor: '教师冻结的独立查询，不是额外模型改写', keywords: draft.keywords },
  prompts: { system: rules.ragSystem, sourcesA }, newValues,
  settings: { baseURL: embeddings.baseURL, model: embeddings.model, dimensions: embeddings.phase.dimensions,
    retrievalAfter: { where: { collection: 'memo', projectCode: draft.projectCode }, lexical: material.settings.lexical, semantic: material.settings.semantic, fusion: material.settings.fusion } },
  bAssembly: '首个用户问题 + 本轮A实际完整正文 + 教师追问及当前检索实际RRF前2来源的完整正文；不注入已删除旧范围或教师未命中资料。' };
writeJson(path.join(root, 'inputs/update/material.json'), update);
const bytes = Buffer.from(JSON.stringify(update, null, 2) + '\n');
writeJson(path.join(root, 'inputs/update/manifest.json'), { frozen: true, teachingFreeze, files: [{ name: 'material.json', bytes: bytes.length, sha256: sha256(bytes) }] });
console.log(JSON.stringify({ sourcesA: sourcesA.map(row => row.id), totalBefore: update.before.length, unchanged: update.action.unchangedBlockIds.length, newEmbeddingInputs: newValues.length, modelCalls: 0 }));
