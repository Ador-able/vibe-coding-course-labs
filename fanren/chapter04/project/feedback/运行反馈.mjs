import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { performance } from 'node:perf_hooks';

const root = dirname(fileURLToPath(import.meta.url));
const hash = text => createHash('sha256').update(text).digest('hex');
const { values } = parseArgs({ options: { prepare: { type: 'boolean' }, 'sdk-dir': { type: 'string' } } });
const inputDir = join(root, '输入');
const sourceDir = resolve(root, '../运行记录/2026-10-14T15-59-44.749Z-ebe5037b-3a15-4793-937d-90905b86ebc6/1-none');
if (values.prepare) {
  const original = await readFile(join(sourceDir, 'output.txt'), 'utf8');
  const task = await readFile(join(sourceDir, 'prompt.txt'), 'utf8');
  const sourceReport = JSON.parse(await readFile(join(sourceDir, 'report.json'), 'utf8'));
  if (hash(original) !== sourceReport.outputSha256) throw new Error('原稿与首轮输出摘要不一致。');
  const instruction = await readFile(join(root, '反馈要求.txt'), 'utf8');
  const prompt = instruction + '\n<已确认任务>\n' + task + '\n</已确认任务>\n\n<待修改稿>\n' + original + '\n</待修改稿>';
  await mkdir(inputDir, { recursive: true });
  await writeFile(join(inputDir, '原稿.txt'), original);
  await writeFile(join(inputDir, 'prompt.txt'), prompt);
  await writeFile(join(inputDir, 'input.json'), JSON.stringify({
    preparedAt: new Date().toISOString(), sourceDir,
    originalSha256: hash(original), taskSha256: hash(task), instructionSha256: hash(instruction), promptSha256: hash(prompt),
    allowedChanges: [{ before: '正午前到崖顶，才够成为正式弟子的时间条件。', after: '想当正式弟子，就得在正午前到崖顶。' }],
    boundary: '使用真实原稿，仅反馈指定短语，不预写或提供修改后的完整正文。'
  }, null, 2));
  console.log(JSON.stringify({ state: 'prepared', inputDir, originalSha256: hash(original), promptSha256: hash(prompt), plannedCalls: 1 }));
  process.exit(0);
}
const input = JSON.parse(await readFile(join(inputDir, 'input.json'), 'utf8'));
const prompt = await readFile(join(inputDir, 'prompt.txt'), 'utf8');
const original = await readFile(join(inputDir, '原稿.txt'), 'utf8');
if (hash(prompt) !== input.promptSha256 || hash(original) !== input.originalSha256) throw new Error('反馈输入与冻结摘要不一致。');
if (!values['sdk-dir']) throw new Error('用 --sdk-dir 指定已有 SDK 0.160.0 目录。');
const sdkDir = await realpath(resolve(values['sdk-dir']));
const sdkPackage = JSON.parse(await readFile(join(sdkDir, 'package.json'), 'utf8'));
if (sdkPackage.version !== '0.160.0') throw new Error('本实验使用 SDK 0.160.0。');
const { Codex } = await import(pathToFileURL(join(sdkDir, 'dist/index.js')).href);
const runDir = join(root, '运行记录', new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID());
const workspace = join(runDir, 'empty-workspace');
await mkdir(workspace, { recursive: true });
await writeFile(join(runDir, 'prompt.txt'), prompt);
await writeFile(join(runDir, 'original.txt'), original);
const settings = { skipGitRepoCheck: true, sandboxMode: 'read-only', approvalPolicy: 'never', webSearchMode: 'disabled', modelReasoningEffort: 'low' };
const config = { executionGitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), runnerSha256: hash(await readFile(fileURLToPath(import.meta.url), 'utf8')), sdkVersion: sdkPackage.version, configuredModel: null, settings, memoryUse: false, memoryGeneration: false, shellTool: false, maxCallMs: 180000, input };
await writeFile(join(runDir, 'config.json'), JSON.stringify(config, null, 2));
const thread = new Codex({ config: { features: { shell_tool: false }, memories: { use_memories: false, generate_memories: false } } }).startThread({ ...settings, workingDirectory: workspace });
const startedAt = new Date().toISOString(), started = performance.now();
let completed = false, failure = null, output = '';
const usageEvents = [], toolEvents = [];
console.log(JSON.stringify({ state: 'running', runDir }));
try {
  const { events } = await thread.runStreamed(prompt, { signal: AbortSignal.timeout(config.maxCallMs) });
  for await (const event of events) {
    await appendFile(join(runDir, 'events.jsonl'), JSON.stringify({ observedAt: new Date().toISOString(), event }) + '\n');
    if (event.type === 'turn.completed') { completed = true; usageEvents.push(event.usage); }
    if (event.type === 'turn.failed' || event.type === 'error') failure = event.error ?? { message: event.message };
    if (event.type.startsWith('item.') && event.item?.type === 'agent_message') output = event.item.text;
    if (event.type === 'item.completed' && ['command_execution', 'mcp_tool_call', 'file_change', 'web_search', 'collab_tool_call'].includes(event.item.type)) toolEvents.push(event.item);
  }
} catch (error) { failure = { name: error.name, message: error.message }; }
const report = {
  state: failure ? 'failed' : completed && output ? 'completed' : 'incomplete',
  startedAt, endedAt: new Date().toISOString(), elapsedMs: performance.now() - started,
  threadId: thread.id, originalSha256: input.originalSha256, promptSha256: input.promptSha256, outputSha256: hash(output),
  outputUtf16: output.length, usageEvents, toolEvents, failure, scriptRetries: 0, internalRetryCount: null,
  limits: '调用完成不等于修改合格；仍须全文对照指定短语与其余文字。生效型号、内部重试、实际金额与真人工时未知。'
};
await writeFile(join(runDir, 'output.txt'), output);
await writeFile(join(runDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ runDir, ...report }));
if (report.state !== 'completed') process.exitCode = 1;

