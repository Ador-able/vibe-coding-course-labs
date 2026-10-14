import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const hash = text => createHash('sha256').update(text).digest('hex');
const { values } = parseArgs({ options: {
  condition: { type: 'string', default: 'all' },
  'sdk-dir': { type: 'string' },
  prepare: { type: 'boolean', default: false },
} });
if (!['all', 'none', 'conflict', 'consistent'].includes(values.condition)) {
  throw new Error('condition 应为 all、none、conflict 或 consistent。');
}

const materialFiles = ['任务-S1.txt', '样例-冲突.txt', '样例-相容.txt'];
const materials = Object.fromEntries(await Promise.all(materialFiles.map(async name =>
  [name, await readFile(join(root, '材料', name), 'utf8')]
)));
const samples = { none: '', conflict: materials['样例-冲突.txt'], consistent: materials['样例-相容.txt'] };
const order = values.condition === 'all'
  ? ['none', 'conflict', 'consistent', 'consistent', 'conflict', 'none']
  : [values.condition];
const settings = {
  skipGitRepoCheck: true,
  sandboxMode: 'read-only',
  approvalPolicy: 'never',
  webSearchMode: 'disabled',
  modelReasoningEffort: 'low',
};
const calls = order.map((condition, index) => {
  const prompt = materials['任务-S1.txt'] + (samples[condition] ? '\n' + samples[condition] : '');
  return { id: `${index + 1}-${condition}`, condition, prompt, promptSha256: hash(prompt) };
});
const frozen = {
  createdAt: new Date().toISOString(),
  executionGitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  runnerSha256: hash(await readFile(fileURLToPath(import.meta.url))),
  purpose: '同一小说任务，只改变写法样例；结果为未采用教学草稿。',
  settings,
  configuredModel: null,
  modelIdentity: '未显式指定型号，沿用已有 CLI 配置；公开事件未提供生效型号时记未知。',
  maxCallMs: 180000,
  scriptRetries: 0,
  files: materialFiles.map(name => ({ name, sha256: hash(materials[name]) })),
  calls,
  criteria: [
    '逐份阅读完整章稿，对照凡人原文核对人物、候选身份、考核规则、正午截止和保护关系。',
    '核对参加选拔的目的、攀爬中的阻碍、停在规定事件范围和完整交付。',
    '正文 800—1200 汉字，不含标题、标点和非汉字；计数不代表内容合格。',
    '未直接交代、直接矛盾、目标缺口与表达偏好分别记录。',
  ],
  boundary: '不预设样例一定被模仿或一定造成错误。文学品质和人的采用需另行判断。',
};
const runDir = join(root, '运行记录', `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`);
await mkdir(runDir, { recursive: true });
const frozenText = JSON.stringify(frozen, null, 2);
await writeFile(join(runDir, 'freeze.json'), frozenText);
await writeFile(join(runDir, 'freeze.sha256'), hash(frozenText) + '\n');
for (const call of calls) {
  const dir = join(runDir, call.id);
  await mkdir(dir);
  await writeFile(join(dir, 'prompt.txt'), call.prompt);
}
console.log(JSON.stringify({ state: values.prepare ? 'prepared' : 'starting', runDir, plannedCalls: calls.length }));
if (values.prepare) process.exit(0);

// 可复用同一章前已有的 SDK 安装；默认使用本项目依赖，不读取或复制登录凭据。
const sdkDir = await realpath(values['sdk-dir']
  ? resolve(values['sdk-dir'])
  : join(dirname(fileURLToPath(import.meta.resolve('@openai/codex-sdk'))), '..'));
const sdkEntry = join(sdkDir, 'dist/index.js');
const sdkPackage = JSON.parse(await readFile(join(sdkDir, 'package.json'), 'utf8'));
if (sdkPackage.version !== '0.160.0') throw new Error('本实验使用 SDK 0.160.0。');
const sdkRequire = createRequire(pathToFileURL(sdkEntry));
const cliPackagePath = sdkRequire.resolve('@openai/codex/package.json');
const cliPackage = JSON.parse(await readFile(cliPackagePath, 'utf8'));
const { Codex } = await import(pathToFileURL(sdkEntry).href);
const codexConfig = { features: { shell_tool: false }, memories: { use_memories: false, generate_memories: false } };
const codex = new Codex({ config: codexConfig });
const dependencies = { sdkVersion: sdkPackage.version, cliPackageVersion: cliPackage.version, nodeVersion: process.version };
await writeFile(join(runDir, 'config.json'), JSON.stringify({ ...dependencies, settings, codexConfig, configuredModel: null, maxCallMs: frozen.maxCallMs }, null, 2));
const reports = [];
for (const call of calls) {
  const dir = join(runDir, call.id);
  const workspace = join(dir, 'empty-workspace');
  await mkdir(workspace);
  const thread = codex.startThread({ ...settings, workingDirectory: workspace });
  const startedAt = new Date().toISOString();
  const started = performance.now();
  let completed = false, failure = null, output = '';
  const usageEvents = [], toolEvents = [];
  console.log(JSON.stringify({ id: call.id, state: 'running' }));
  try {
    const { events } = await thread.runStreamed(call.prompt, { signal: AbortSignal.timeout(frozen.maxCallMs) });
    for await (const event of events) {
      await appendFile(join(dir, 'events.jsonl'), JSON.stringify({ observedAt: new Date().toISOString(), event }) + '\n');
      if (event.type === 'turn.completed') { completed = true; usageEvents.push(event.usage); }
      if (event.type === 'turn.failed' || event.type === 'error') failure = event.error ?? { message: event.message };
      if (event.type.startsWith('item.') && event.item?.type === 'agent_message') output = event.item.text;
      if (event.type === 'item.completed' && ['command_execution', 'mcp_tool_call', 'file_change', 'web_search', 'collab_tool_call'].includes(event.item.type)) toolEvents.push(event.item);
    }
  } catch (error) {
    failure = { name: error.name, message: error.message };
  }
  const report = {
    id: call.id, condition: call.condition,
    state: failure ? 'failed' : completed && output ? 'completed' : 'incomplete',
    startedAt, endedAt: new Date().toISOString(), elapsedMs: performance.now() - started,
    threadId: thread.id, promptSha256: call.promptSha256, outputSha256: hash(output),
    outputUtf16: output.length, usageEvents, toolEvents, failure, scriptRetries: 0,
    internalRetryCount: null,
    limits: '完成仅指公开调用结束并取得文字；工具事件、事实关系与完整交付仍需核对。内部重试、实际金额、真人工时和生效型号未测得。',
  };
  await writeFile(join(dir, 'output.txt'), output);
  await writeFile(join(dir, 'report.json'), JSON.stringify(report, null, 2));
  reports.push(report);
  await writeFile(join(runDir, 'reports.json'), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify({ id: call.id, state: report.state, elapsedMs: Math.round(report.elapsedMs), toolCount: toolEvents.length, usageEvents }));
}
console.log(JSON.stringify({ runDir, actualCalls: reports.length, states: reports.map(({ id, state }) => ({ id, state })) }));
if (reports.some(item => item.state !== 'completed')) process.exitCode = 1;

