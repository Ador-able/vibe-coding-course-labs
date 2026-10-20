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
  const sourcePaths = {
    S1: resolve(root, '../材料/任务-S1.txt'),
    S2: resolve(root, '../材料/任务-S2.txt'),
    S3: resolve(root, '../材料/任务-S3.txt'),
  };
  const tasks = Object.fromEntries(await Promise.all(Object.entries(sourcePaths).map(async ([id, path]) => [id, await readFile(path, 'utf8')])));
  const priorPrompt = await readFile(resolve(root, '../运行记录/2026-10-14T15-59-44.749Z-ebe5037b-3a15-4793-937d-90905b86ebc6/1-none/prompt.txt'), 'utf8');
  if (tasks.S1 !== priorPrompt) throw new Error('S1 与首轮实际输入不一致。');
  const addition = await readFile(join(root, '通用核对要求.txt'), 'utf8');
  const order = [
    { sample: 'S1', method: 'B', phase: 'development' },
    { sample: 'S2', method: 'A', phase: 'heldout' },
    { sample: 'S3', method: 'B', phase: 'heldout' },
    { sample: 'S2', method: 'B', phase: 'heldout' },
    { sample: 'S3', method: 'A', phase: 'heldout' },
  ];
  const frozen = {
    preparedAt: new Date().toISOString(), unitKey: 'vcm-09-10',
    purpose: '将真实生成、局部编辑及进程失败分开留档；比较追加事前核对后在不同原文情境中的结果。',
    sourcePaths, taskSha256: Object.fromEntries(Object.entries(tasks).map(([id, text]) => [id, hash(text)])),
    tasks, addition, additionSha256: hash(addition),
    provenance: {
      priorRecords: '../运行记录/2026-10-14T15-59-44.749Z-ebe5037b-3a15-4793-937d-90905b86ebc6',
      problem: '四份完成稿均保留正午；S1另有局部表达反馈。后两次进程失败无正文，不能归类为内容错误，也不以改写提示声称修好进程。',
      heldout: 'S2/S3使用C03—C05的不同真实情节，本轮前固定，不按新输出调整B。它们不是随机抽取的真实用户任务分布。',
    },
    calls: order.map((call, index) => {
      const prompt = tasks[call.sample] + (call.method === 'B' ? '\n' + addition : '');
      return { id: `${index + 1}-${call.sample}-${call.method}`, ...call, prompt, promptSha256: hash(prompt) };
    }),
    settings: { skipGitRepoCheck: true, sandboxMode: 'read-only', approvalPolicy: 'never', webSearchMode: 'disabled', modelReasoningEffort: 'low' },
    configuredModel: null, maxCallMs: 180000, scriptRetries: 0,
    commonCriteria: [
      '完整标题与正文，不含后续章节、大纲、说明或自评；正文800—1200汉字，排除标题、标点及非汉字。',
      '读者可从正文理解韩立当前目的和具体阻碍，结束在各任务约定的情节范围。',
      '遵守本轮所处时点的身份、考核规则和已学内容，不提前引入法术、功法或录取结论。',
      '只按当前输入判断事实与行动条件；未直接表述、直接矛盾、目标缺口和表达偏好分别记录。',
    ],
    sampleCriteria: {
      S1: ['韩立十岁，从未习武，岳堂主宣布正午前到崖顶的规则，师兄保护。', '结束在竹林中继续前行，不写考核结果。'],
      S2: ['仍是考核中的孩子；舞岩在前，韩立身体受伤，师兄保护，正午截止。', '写到接近并抓住麻绳，不写崖顶公布结果。'],
      S3: ['韩立、张铁未按时登顶，暂留半年再考核；舞岩去七绝堂。', '墨大夫带两人入神手谷，先教采药炼药或医术，不教武功，不能说已得修仙功法。'],
    },
    boundaries: ['五次均为新生成，局部反馈成功不计入本轮生成成功。', '每条件一次，不重抽、不补抽、不看到结果后调提示。', '分项证据对应完整原文，不用模型自评分数代替核对；文学品质和人的采用另判。'],
  };
  await mkdir(inputDir, { recursive: true });
  const text = JSON.stringify(frozen, null, 2);
  await writeFile(join(inputDir, 'freeze.json'), text);
  await writeFile(join(inputDir, 'freeze.sha256'), hash(text) + '\n');
  for (const [id, task] of Object.entries(tasks)) await writeFile(join(inputDir, '任务-' + id + '.txt'), task);
  for (const call of frozen.calls) await writeFile(join(inputDir, call.id + '-prompt.txt'), call.prompt);
  console.log(JSON.stringify({ state: 'prepared', inputDir, freezeSha256: hash(text), plannedCalls: frozen.calls.length }));
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
console.log(JSON.stringify({ state: 'starting', runDir, plannedCalls: frozen.calls.length }));
for (const call of frozen.calls) {
  const dir = join(runDir, call.id), workspace = join(dir, 'empty-workspace');
  await mkdir(workspace, { recursive: true });
  await writeFile(join(dir, 'prompt.txt'), call.prompt);
  const thread = codex.startThread({ ...frozen.settings, workingDirectory: workspace });
  const startedAt = new Date().toISOString(), started = performance.now();
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
  } catch (error) { failure = { name: error.name, message: error.message }; }
  const report = {
    id: call.id, sample: call.sample, method: call.method, phase: call.phase,
    state: failure ? 'failed' : completed && output ? 'completed' : 'incomplete',
    startedAt, endedAt: new Date().toISOString(), elapsedMs: performance.now() - started,
    threadId: thread.id, promptSha256: call.promptSha256, outputSha256: hash(output),
    outputUtf16: output.length, usageEvents, toolEvents, failure, scriptRetries: 0, internalRetryCount: null,
    limits: '公开调用完成不等于正文合格；按当前完整任务逐份核对。生效型号、内部重试、实际金额和真人工时未知。',
  };
  await writeFile(join(dir, 'output.txt'), output);
  await writeFile(join(dir, 'report.json'), JSON.stringify(report, null, 2));
  reports.push(report);
  await writeFile(join(runDir, 'reports.json'), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify({ id: call.id, state: report.state, elapsedMs: Math.round(report.elapsedMs), usageEvents, toolCount: toolEvents.length }));
}
console.log(JSON.stringify({ runDir, actualCalls: reports.length, states: reports.map(({ id, state }) => ({ id, state })) }));
if (reports.some(item => item.state !== 'completed')) process.exitCode = 1;

