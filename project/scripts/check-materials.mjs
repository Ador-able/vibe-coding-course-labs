import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { loadMaterials, root, readJson, sha256 } from '../src/materials.mjs';

const x = loadMaterials();
assert.deepEqual(fs.readFileSync(path.join(root, 'public/original-body.txt'), 'utf8'), x.body);
for (const page of x.pages.pages) assert.equal(x.body.slice(page.sourceUtf16Start, page.sourceUtf16End), page.text);
const map = readJson(path.join(root, 'public/page-images.json'));
for (const page of map) {
  const bytes = fs.readFileSync(path.join(root, 'public', page.imagePath));
  assert.equal(bytes.length, page.bytes); assert.equal(sha256(bytes), page.sha256);
}
const dependencies = readJson(path.join(root, 'package.json')).dependencies;
assert.equal(dependencies.ai, '7.0.122'); assert.equal(dependencies['@ai-sdk/openai-compatible'], '3.0.59');
assert.equal(dependencies['@orama/orama'], '3.1.18'); assert.equal(dependencies['@orama/tokenizers'], '3.1.18');
process.stdout.write(JSON.stringify({ passed: true, inputFiles: x.inputFiles.length, corpus: x.corpus.length,
  queryCount: x.queries.length, embeddingValues: x.values.length, images: map.length,
  actualEmbeddingsExecuted: false, actualRankingExecuted: false, browserExecuted: false }) + '\n');
