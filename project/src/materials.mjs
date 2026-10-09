import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const readJson = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
export const writeJson = (filename, value) => fs.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n');
export function git(args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (r.error) throw r.error;
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
export function loadMaterials() {
  const dir = path.join(root, 'inputs/retrieval'), manifest = readJson(path.join(dir, '固定输入清单.json'));
  const inputFiles = manifest.files.map(f => {
    const bytes = fs.readFileSync(path.join(dir, f.name));
    assert.equal(bytes.length, f.bytes, f.name); assert.equal(sha256(bytes), f.sha256, f.name);
    return { ...f, path: 'inputs/retrieval/' + f.name };
  });
  const corpus = readJson(path.join(dir, '04-完整22块资料与定位.json'));
  const queries = readJson(path.join(dir, '05-三个完整问题与两路查询.json'));
  const settings = readJson(path.join(dir, '06-固定条件与执行范围.json'));
  const values = readJson(path.join(dir, '07-25条完整向量输入.json'));
  const body = fs.readFileSync(path.join(dir, '01-完整第三章原文.txt'), 'utf8');
  const pages = readJson(path.join(dir, '02-已有完整分页与位置.json'));
  assert.equal(corpus.length, 22); assert.equal(queries.length, 3); assert.equal(values.length, 25);
  assert.equal(new Set(corpus.map(x => x.id)).size, 22); assert.equal(new Set(values.map(x => x.id)).size, 25);
  assert.equal(corpus.filter(x => x.collection === 'story').length, 18);
  assert.equal(corpus.filter(x => x.collection === 'memo').length, 4);
  for (const row of corpus) {
    assert.equal(sha256(row.text), row.textSha256, row.id);
    if (row.collection === 'story') {
      assert.equal(body.slice(row.source.bodyRange.start, row.source.bodyRange.end), row.text, row.id);
      assert.equal(row.source.bodySha256, sha256(body), row.id);
      assert.deepEqual(row.source.originalChunk.text, row.text);
    } else {
      assert.equal(fs.readFileSync(path.join(dir, row.source.fileName), 'utf8'), row.text, row.id);
    }
  }
  const expected = [...corpus.map(x => ({ id: x.id, role: 'document', text: x.text, textSha256: x.textSha256 })),
    ...queries.map(x => ({ id: x.id, role: 'query', text: x.semanticQuery, textSha256: sha256(x.semanticQuery) }))];
  assert.deepEqual(values, expected, '25条输入须按唯一ID与文本摘要对应');
  assert.equal(settings.lexical.exact, false); assert.equal(settings.lexical.tolerance, 0);
  assert.equal(settings.semantic.batchSize, 10); assert.equal(settings.semantic.dimensions, 1024);
  assert.equal(settings.semantic.maxRetries, 0); assert.equal(settings.semantic.maxParallelCalls, 1);
  assert.equal(settings.fusion.k, 60); assert.equal(settings.fusion.rankStartsAt, 1);
  return { corpus, queries, settings, values, body, pages, inputFiles };
}

// 逻辑筛选与Orama API形态不同，但两路使用同一份元数据等值条件。
export const matchesWhere = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
export const oramaWhere = where => Object.fromEntries(Object.entries(where).map(([key, value]) => [key, { eq: value }]));
export const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
