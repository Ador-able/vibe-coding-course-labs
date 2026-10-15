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
if (values.prepare) {
  const evaluationDir = resolve(root, '../evaluation/输入');
  const sourceText = await readFile(join(evaluationDir, 'freeze.json'), 'utf8');
  const sourceHash = (await readFile(join(evaluationDir, 'freeze.sha256'), 'utf8')).trim();
  if (hash(sourceText) !== sourceHash) throw new Error('评估输入的冻结摘要不匹配。');
  const evaluation = JSON.parse(sourceText);
  const tasks = { S2: evaluation.tasks.S2, S3: evaluation.tasks.S3 };
  const reviewInstruction = await readFile(resolve(root, '../材料/通用审稿要求.txt'), 'utf8');
  const initialDirectory = resolve(root, '../evaluation/运行记录/2026-10-15T00-34-23.662Z-cd7031af-81a6-4aa3-8e9f-71b5fa29d01e');
  const pairs = [{ id: 'P1', sample: 'S2', sourceId: '2-S2-A' }, { id: 'P2', sample: 'S3', sourceId: '5-S3-A' }];
  const initialHashes = {};
  for (const pair of pairs) {
    const report = JSON.parse(await readFile(join(initialDirectory, pair.sourceId, 'report.json'), 'utf8'));
    const output = await readFile(join(initialDirectory, pair.sourceId, 'output.txt'), 'utf8');
    if (report.state !== 'completed' || hash(output) !== report.outputSha256 || report.promptSha256 !== hash(tasks[pair.sample])) throw new Error('原始初稿或任务与前节记录不一致。');
    initialHashes[pair.id] = { promptSha256: report.promptSha256, outputSha256: report.outputSha256 };
  }
  const frozen = {
    preparedAt: new Date().toISOString(), unitKey: 'vcm-09-04',
    purpose: '同一初稿成对比较：A直接保留，B再核对并修订；按完整任务判断结果与全链代价。',
    source: { path: join(evaluationDir, 'freeze.json'), sha256: sourceHash },
    tasks, taskSha256: Object.fromEntries(Object.entries(tasks).map(([id, text]) => [id, hash(text)])),
    reviewInstruction, reviewInstructionSha256: hash(reviewInstruction),
    reviewTemplate: '通用核对要求 + <写作任务>完整原任务</写作任务> + <初稿>本对完整实际初稿</初稿>',
    pairs, initialDirectory, initialHashes,
    settings: { skipGitRepoCheck: true, sandboxMode: 'read-only', approvalPolicy: 'never', webSearchMode: 'disabled', modelReasoningEffort: 'low' },
    configuredModel: null, maxCallMs: 180000, scriptRetries: 0,
    passCriteria: [
      { id: 'identity', criterion: '身份与所学按当前原文时点：不提前写为正式录取、使用法术或获得修仙功法。' },
      { id: 'time_and_entry', criterion: 'S2正午截止、舞岩在前、师兄保护；S3未按时登顶、暂留半年复考、舞岩去七绝堂。' },
      { id: 'learning', criterion: 'S3墨大夫带韩立张铁入神手谷，先教采药炼药和可能医术，不教武功。' },
      { id: 'purpose_and_obstacle', criterion: '读者可理解当前目的和具体阻碍；相容细节允许不同写法。' },
      { id: 'ending', criterion: 'S2结束在抓住麻绳，不宣布韩立考核结果；S3写到晚间交代学习安排，不展开以后修炼结果。' },
      { id: 'delivery', criterion: '完整交付与字数：标题和完整正文，正文800—1200汉字，排除标题、标点及非汉字；没有后续章节、大纲、说明或自评。' },
    ],
    judgment: '主流程逐份阅读完整任务与实际全文，记录原句依据。六类必要条件共同满足才记合格；未直接说明不等于相反，必要目标缺失与表达偏好分别记。文学品质及人的采用不由本口径证明。',
    failureRule: '初稿未取得公开完成事件或结果为空时，对应审稿跳过，不重抽；记录已发生的等待、用量和错误，继续下一对。内容是否完整仍由全文阅读判断。',
    costRule: 'A包含本对初稿调用；B包含同一初稿调用和实际发生的审稿。全轮实际调用是各调用一次计数，不能把A和B相加后重复计算初稿。失败消耗不删除。',
    usageBoundary: '缓存输入与推理输出是输入及输出的细分，不重复相加。字段缺失保留未知，SDK公开字段不等于供应商账单。',
    unknowns: { money: null, humanTimeMs: null, effectiveModel: null, internalRetryCount: null },
    boundary: 'S2/S3是已知课堂条件的重复与回归观察，不是未见输入；不以本轮结果推断未来可靠性，不按输出调整审稿要求。',
  };
  await mkdir(inputDir, { recursive: true });
  const text = JSON.stringify(frozen, null, 2);
  await writeFile(join(inputDir, 'freeze.json'), text);
  await writeFile(join(inputDir, 'freeze.sha256'), hash(text) + '\n');
  for (const [id, task] of Object.entries(tasks)) await writeFile(join(inputDir, '任务-' + id + '.txt'), task);
  await writeFile(join(inputDir, '通用核对修订.txt'), reviewInstruction);
  console.log(JSON.stringify({ state: 'prepared', inputDir, freezeSha256: hash(text), pairs: frozen.pairs, importedDraftCalls: 2, maximumNewCalls: 2 }));
  process.exit(0);
}
const frozenText = await readFile(join(inputDir, 'freeze.json'), 'utf8');
const frozenHash = (await readFile(join(inputDir, 'freeze.sha256'), 'utf8')).trim();
if (hash(frozenText) !== frozenHash) throw new Error('冻结文件发生改变。');
const frozen = JSON.parse(frozenText);
if (!values['sdk-dir']) throw new Error('用 --sdk-dir 指定已有 SDK 0.160.0 目录。');
const sdkDir = await realpath(resolve(values['sdk-dir']));
const sdkPackage = JSON.parse(await readFile(join(sdkDir, 'package.json'), 'utf8'));
if (sdkPackage.version !== '0.160.0') throw new Error('本实验使用 SDK 0.160.0。');
const { Codex } = await import(pathToFileURL(join(sdkDir, 'dist/index.js')).href);
const runDir = join(root, '运行记录', new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID());
await mkdir(runDir, { recursive: true });
await writeFile(join(runDir, 'freeze.json'), frozenText);
await writeFile(join(runDir, 'config.json'), JSON.stringify({ executionGitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), runnerSha256: hash(await readFile(fileURLToPath(import.meta.url), 'utf8')), sdkVersion: sdkPackage.version, nodeVersion: process.version, settings: frozen.settings, configuredModel: null, memoryUse: false, memoryGeneration: false, shellTool: false, freezeSha256: frozenHash, maxCallMs: frozen.maxCallMs }, null, 2));
const codex = new Codex({ config: { features: { shell_tool: false }, memories: { use_memories: false, generate_memories: false } } }), reports = [];
console.log(JSON.stringify({ state: 'starting', runDir, importedDraftCalls: 2, maximumNewCalls: 2 }));

// 每对共享同一次初稿；审稿的新会话只收到固定要求、原任务和该初稿。
async function runCall(pair, step, prompt) {
  const id = pair.id + '-' + step, dir = join(runDir, id), workspace = join(dir, 'empty-workspace');
  await mkdir(workspace, { recursive: true });
  await writeFile(join(dir, 'prompt.txt'), prompt);
  const thread = codex.startThread({ ...frozen.settings, workingDirectory: workspace });
  const startedAt = new Date().toISOString(), started = performance.now();
  let completed = false, failure = null, output = '';
  const usageEvents = [], toolEvents = [];
  console.log(JSON.stringify({ id, state: 'running' }));
  try {
    const { events } = await thread.runStreamed(prompt, { signal: AbortSignal.timeout(frozen.maxCallMs) });
    for await (const event of events) {
      await appendFile(join(dir, 'events.jsonl'), JSON.stringify({ observedAt: new Date().toISOString(), event }) + '\n');
      if (event.type === 'turn.completed') { completed = true; usageEvents.push(event.usage); }
      if (event.type === 'turn.failed' || event.type === 'error') failure = event.error ?? { message: event.message };
      if (event.type.startsWith('item.') && event.item?.type === 'agent_message') output = event.item.text;
      if (event.type === 'item.completed' && ['command_execution', 'mcp_tool_call', 'file_change', 'web_search', 'collab_tool_call'].includes(event.item.type)) toolEvents.push(event.item);
    }
  } catch (error) { failure = { name: error.name, message: error.message }; }
  const report = {
    id, pair: pair.id, sample: pair.sample, step,
    state: failure ? 'failed' : completed && output.trim() ? 'completed' : 'incomplete',
    startedAt, endedAt: new Date().toISOString(), elapsedMs: performance.now() - started,
    threadId: thread.id, promptSha256: hash(prompt), outputSha256: hash(output),
    outputUtf16: output.length, usageEvents, toolEvents, failure, scriptRetries: 0, internalRetryCount: null,
    limits: '公开调用完成不等于内容合格；必须按冻结的六类必要条件阅读全文。',
  };
  await writeFile(join(dir, 'output.txt'), output);
  await writeFile(join(dir, 'report.json'), JSON.stringify(report, null, 2));
  reports.push(report);
  await writeFile(join(runDir, 'reports.json'), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify({ id, state: report.state, elapsedMs: Math.round(report.elapsedMs), usageEvents, toolCount: toolEvents.length }));
  return { report, output };
}
for (const pair of frozen.pairs) {
  const task = frozen.tasks[pair.sample];
  // 原样复用前节实际初稿，不重新生成来替换比较起点。
  const sourceDir = join(frozen.initialDirectory, pair.sourceId), dir = join(runDir, pair.id + '-draft');
  const originalReportText = await readFile(join(sourceDir, 'report.json'), 'utf8');
  const originalReport = JSON.parse(originalReportText), output = await readFile(join(sourceDir, 'output.txt'), 'utf8');
  if (hash(output) !== frozen.initialHashes[pair.id].outputSha256 || originalReport.promptSha256 !== frozen.initialHashes[pair.id].promptSha256) throw new Error('冻结后原始初稿发生变化。');
  await mkdir(dir, { recursive: true });
  for (const name of ['prompt.txt', 'output.txt', 'events.jsonl']) await writeFile(join(dir, name), await readFile(join(sourceDir, name)));
  await writeFile(join(dir, 'original-report.json'), originalReportText);
  const draft = { output, report: { ...originalReport, id: pair.id + '-draft', pair: pair.id, sample: pair.sample, step: 'draft', importedFrom: sourceDir, newlyExecuted: false } };
  await writeFile(join(dir, 'report.json'), JSON.stringify(draft.report, null, 2));
  reports.push(draft.report);
  if (draft.report.state !== 'completed') {
    reports.push({ id: pair.id + '-review', pair: pair.id, sample: pair.sample, step: 'review', state: 'not_run', reason: '初稿调用未完成或结果为空，保留已发生消耗，不另抽稿。' });
    await writeFile(join(runDir, 'reports.json'), JSON.stringify(reports, null, 2));
    continue;
  }
  const prompt = frozen.reviewInstruction + '\n<写作任务>\n' + task + '\n</写作任务>\n\n<初稿>\n' + draft.output + '\n</初稿>';
  await runCall(pair, 'review', prompt);
}

// 缺少公开用量的调用仍计入路径；该字段总量记未知，不以零补齐。
function cost(records) {
  const calls = records.filter(record => record.state !== 'not_run');
  const fields = ['input_tokens', 'cached_input_tokens', 'cache_write_input_tokens', 'output_tokens', 'reasoning_output_tokens'];
  const usage = Object.fromEntries(fields.map(field => {
    const known = calls.every(record => record.usageEvents.length > 0 && record.usageEvents.every(event => typeof event[field] === 'number'));
    return [field, known ? calls.reduce((sum, record) => sum + record.usageEvents.reduce((total, event) => total + event[field], 0), 0) : null];
  }));
  return { callIds: calls.map(record => record.id), calls: calls.length, elapsedMs: calls.reduce((sum, record) => sum + record.elapsedMs, 0), usage };
}
const actual = reports.filter(record => record.state !== 'not_run');
const costs = {
  pairs: frozen.pairs.map(pair => {
    const records = reports.filter(record => record.pair === pair.id);
    return { pair: pair.id, sample: pair.sample, A: cost(records.filter(record => record.step === 'draft')), B: cost(records), reviewState: records.find(record => record.step === 'review').state, qualifiedA: null, qualifiedB: null };
  }),
  A: cost(actual.filter(record => record.step === 'draft')),
  B: cost(actual),
  recordedCalls: actual.length,
  newCalls: actual.filter(record => record.newlyExecuted !== false).length,
  skippedReviews: reports.filter(record => record.state === 'not_run').length,
  unknowns: frozen.unknowns,
  boundary: 'A与B共享同一初稿，实际调用数不能把A.calls和B.calls相加。B是完整路径，包含初稿和审稿；合格结论待阅读全文，不自动填入。'
};
await writeFile(join(runDir, 'cost-paths.json'), JSON.stringify(costs, null, 2));
console.log(JSON.stringify({ runDir, recordedCalls: costs.recordedCalls, newCalls: costs.newCalls, skippedReviews: costs.skippedReviews, A: costs.A, B: costs.B }));
if (reports.some(item => item.state !== 'completed')) process.exitCode = 1;

