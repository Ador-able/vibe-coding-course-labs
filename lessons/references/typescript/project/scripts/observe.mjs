import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = resolve(root, 'runs', randomUUID());
mkdirSync(directory, { recursive: true });
const records = [];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function run(label, args, { cwd = root, demoMessage = null } = {}) {
  const env = { ...process.env };
  delete env.VCR01_DEMO_MESSAGE;
  if (demoMessage !== null) env.VCR01_DEMO_MESSAGE = demoMessage;
  const result = spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8', windowsHide: true, timeout: 10000 });
  const record = { label, command: process.execPath, args, cwd, demoOverride: demoMessage, status: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error?.message ?? null };
  records.push(record);
  return record;
}
run('有效外部输入', ['src/input.ts']);
run('教学错误类型', ['src/input.ts', 'inputs/错误类型.json']);
run('真实异步保存与完整读回', ['src/save.ts']);
const savedFile = resolve(root, 'output/草稿.json');
const savedBefore = readFileSync(savedFile);
// 以已有文件充当目录，形成明确标注的教学文件系统故障。
run('教学写入失败', ['src/save.ts', resolve(savedFile, '失败草稿.json')]);
const savedAfter = readFileSync(savedFile);
run('项目根与未加载env文件', ['src/environment.ts']);
run('不同cwd', [resolve(root, 'src/environment.ts')], { cwd: resolve(root, 'inputs') });
run('显式env文件', ['--env-file=inputs/演示环境.env', 'src/environment.ts']);
run('现有进程变量优先', ['--env-file=inputs/演示环境.env', 'src/environment.ts'], { demoMessage: 'from-process' });
run('真实UTF8分块', ['src/encoding.ts']);
const report = { node: process.version, modelCalls: 0, scope: '独立CLI教学输入；没有模型、界面、生产数据库或交互终端。', records, completeSavedBeforeFailure: savedBefore.toString('utf8'), completeSavedAfterFailure: savedAfter.toString('utf8'), beforeSha256: sha(savedBefore), afterSha256: sha(savedAfter), previousFileUnchanged: savedBefore.equals(savedAfter) };
writeFileSync(resolve(directory, '完整观察.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ directory, statuses: records.map(item => ({ label: item.label, status: item.status })), previousFileUnchanged: report.previousFileUnchanged, modelCalls: 0 }));
