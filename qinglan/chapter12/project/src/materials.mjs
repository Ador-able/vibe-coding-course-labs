import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const readJson = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
export const writeJson = (filename, value) => { fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n'); };
export function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || '未能读取源码版本');
  return result.stdout.trim();
}
export const matchesWhere = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
export const oramaWhere = where => Object.fromEntries(Object.entries(where).map(([key, value]) => [key, { eq: value }]));
export const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export function loadFrozen(folder) {
  const directory = path.join(root, 'inputs', folder);
  const manifest = readJson(path.join(directory, 'manifest.json'));
  assert.equal(manifest.frozen, true, '完整输入尚未冻结，不能请求模型。');
  const files = manifest.files.map(file => {
    const bytes = fs.readFileSync(path.join(directory, file.name));
    assert.equal(bytes.length, file.bytes, file.name); assert.equal(sha256(bytes), file.sha256, file.name);
    return { ...file, path: `inputs/${folder}/${file.name}` };
  });
  return { manifest, files, read: name => { assert(files.some(file => file.name === name), '读取的输入必须在冻结清单中'); return readJson(path.join(directory, name)); } };
}
export function loadMaterials() {
  const frozen = loadFrozen('retrieval');
  const data = frozen.read('material.json');
  assert.equal(new Set(data.corpus.map(row => row.id)).size, data.corpus.length);
  for (const row of data.corpus) assert.equal(sha256(row.text), row.textSha256, row.id);
  const values = [...data.corpus.map(({ id, text, textSha256 }) => ({ id, role: 'document', text, textSha256 })), ...data.queries.map(row => ({ id: row.id, role: 'query', text: row.semanticQuery, textSha256: sha256(row.semanticQuery) }))];
  assert.deepEqual(data.values, values);
  return { ...data, inputFiles: frozen.files };
}
export function newRun(label) {
  assert(label && /^[A-Za-z0-9_-]+$/.test(label), '请指定本次唯一记录名，只用英文、数字、下划线或短横线。');
  const directory = path.join(root, 'runs', label);
  fs.mkdirSync(path.dirname(directory), { recursive: true }); fs.mkdirSync(directory);
  return { directory, runId: randomUUID(), startedAt: new Date().toISOString(), gitHead: git(['rev-parse', 'HEAD']), sourceVersion: fs.existsSync(path.join(root, 'source-version.json')) ? readJson(path.join(root, 'source-version.json')) : null };
}
export function saveRun(run, report, publicName) {
  const bytes = JSON.stringify(report, null, 2) + '\n';
  fs.writeFileSync(path.join(run.directory, 'report.json'), bytes);
  writeJson(path.join(run.directory, 'record-bytes.json'), { bytes: Buffer.byteLength(bytes), sha256: sha256(bytes) });
  if (publicName) fs.writeFileSync(path.join(root, 'public/records', publicName), bytes);
}
