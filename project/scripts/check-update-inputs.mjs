import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { loadUpdateMaterials } from '../src/update-materials.mjs';
import { root, sha256, git } from '../src/materials.mjs';

const material = loadUpdateMaterials();
const versions = ['ai', '@ai-sdk/openai-compatible', '@orama/orama', '@orama/tokenizers'].map(name => {
  const bytes = fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'));
  const pkg = JSON.parse(bytes);
  const expected = { ai: '7.0.122', '@ai-sdk/openai-compatible': '3.0.59', '@orama/orama': '3.1.18', '@orama/tokenizers': '3.1.18' };
  assert.equal(pkg.version, expected[name], name);
  return { name, version: pkg.version, packageJSONSha256: sha256(bytes) };
});
process.stdout.write(JSON.stringify({ command: [process.execPath, ...process.argv.slice(1)], cwd: process.cwd(), node: process.version,
  ownGitRoot: git(['rev-parse', '--show-toplevel']), head: git(['rev-parse', 'HEAD']), inputs: material.inputFiles,
  versions, lockSHA256: sha256(fs.readFileSync(path.join(root, 'pnpm-lock.yaml'))),
  unchangedFullObjects: material.action.unchangedBlockIds.length, existingVectors: material.previousEmbeddings.embeddings.length,
  newFeeFile: { name: material.action.replacement.source.fileName, bytes: fs.statSync(path.join(root, 'public/materials', material.action.replacement.source.fileName)).size,
    sha256: sha256(fs.readFileSync(path.join(root, 'public/materials', material.action.replacement.source.fileName))) },
  passed: true, scope: '只有文件/Git/完整输入与既有向量核对；没有生成、嵌入、索引更新、检索、HTTP或界面。' }, null, 2) + '\n');
