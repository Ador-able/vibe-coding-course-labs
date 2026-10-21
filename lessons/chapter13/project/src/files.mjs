import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

export const root = path.dirname(import.meta.dirname);
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const json = value => JSON.stringify(value, null, 2) + '\n';
export const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export function writeJson(file, value) { fs.writeFileSync(file, json(value)); }
export function writeNew(file, value) { fs.writeFileSync(file, json(value), { flag: 'wx' }); }
export function replaceJson(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, json(value), { flag: 'wx' }); fs.renameSync(temporary, file);
}
export function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('当前源码必须位于课程仓库的独立 Git 工作目录。');
  return result.stdout.trim();
}
export function readInputs(requireFrozen = true) {
  const registry = readJson(path.join(root, 'inputs/registry.json'));
  if (requireFrozen) assert.equal(registry.frozen, true, '完整教学输入尚未冻结，不能执行模型。');
  const files = {}, texts = {};
  for (const item of registry.files) {
    const raw = fs.readFileSync(path.join(root, 'inputs', item.name));
    assert.equal(raw.length, item.bytes, item.name); assert.equal(sha256(raw), item.sha256, item.name);
    texts[item.key] = raw.toString('utf8'); files[item.key] = item.name.endsWith('.json') ? JSON.parse(texts[item.key]) : texts[item.key];
  }
  return { registry, files, texts };
}
export function checkSource() {
  const version = readJson(path.join(root, 'source-version.json'));
  for (const item of version.files) {
    const raw = fs.readFileSync(path.join(root, item.name));
    assert.equal(raw.length, item.bytes, item.name); assert.equal(sha256(raw), item.sha256, item.name);
  }
  assert.equal(version.sourceVersion, `sha256:${sha256(JSON.stringify(version.files))}`);
  return version;
}
export function createRun(group, name) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name || '')) throw new Error('请提供只含小写字母、数字和短横线的新记录名。');
  const inputs = readInputs(), source = checkSource();
  // 真正执行的起点必须已经提交；课堂实录与展示数据另行保存。
  const executionGitHead = requireGitStart();
  const directory = path.join(root, 'records', group, name);
  fs.mkdirSync(path.dirname(directory), { recursive: true }); fs.mkdirSync(directory);
  const report = { group, name, startedAt: new Date().toISOString(), executionGitHead, sourceVersion: source.sourceVersion,
    inputFiles: inputs.registry.files, actualHttpRequests: 0, textTasks: 0, calls: [], outcome: 'started' };
  const save = () => replaceJson(path.join(directory, 'report.json'), report);
  save(); return { directory, report, save, inputs };
}
export function requireGitStart() {
  const watched = ['src', 'scripts', 'test', 'public/*.html', 'public/*.js', 'public/*.css', 'inputs', 'package.json', '../../../pnpm-lock.yaml'];
  assert.equal(git(['status', '--porcelain', '--', ...watched]), '', '请先冻结并提交本次实际执行源码与完整输入。');
  return git(['rev-parse', 'HEAD']);
}
export function finishRun(run, error) {
  run.report.outcome = error ? 'failed' : 'returned';
  if (error) run.report.error = { name: error.name, message: String(error.message) };
  run.report.finishedAt = new Date().toISOString(); run.save();
  const file = path.join(root, 'records/index.json');
  const index = fs.existsSync(file) ? readJson(file) : { groups: {}, history: [] };
  const reportPath = path.relative(root, path.join(run.directory, 'report.json')).replaceAll('\\', '/');
  index.groups[run.report.group] = reportPath; index.history.push(reportPath); replaceJson(file, index);
}
