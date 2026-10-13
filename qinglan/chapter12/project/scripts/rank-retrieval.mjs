import path from 'node:path';
import assert from 'node:assert/strict';
import { root, readJson, loadMaterials, newRun, saveRun } from '../src/materials.mjs';
import { rankMaterial } from '../src/retrieval.mjs';
import { checkTeaching } from '../src/frozen.mjs';

checkTeaching(); const material = loadMaterials(); const embedded = readJson(path.join(root, 'public/records/embeddings.json'));
assert.equal(embedded.completed, true, '真实向量生成未完成，不能排名。'); assert.deepEqual(embedded.phase.input.values, material.values);
const run = newRun(process.argv[2]); const ranking = await rankMaterial(material, embedded.embeddings);
const report = { ...run, directory: undefined, ...ranking, embeddingRunId: embedded.runId, model: embedded.model, dimensions: embedded.phase.dimensions, inputFiles: material.inputFiles, newModelCalls: 0, actualHttpRequests: 0 };
saveRun(run, report, 'retrieval.json'); console.log(JSON.stringify({ runId: run.runId, cases: ranking.cases.length, newModelCalls: 0 }));
