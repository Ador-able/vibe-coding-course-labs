import { createHash, randomUUID } from 'node:crypto';
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
    S1: resolve(root, '../project/运行记录/2026-10-12T17-33-04.755Z-42976b0b-04b4-4d6c-8b13-bfef42a8e443/1-none/prompt.txt'),
    S2: resolve(root, '../project/材料/任务-S2.txt'),
    S3: resolve(root, '../project/材料/任务-S3.txt'),
  };
  const tasks = Object.fromEntries(await Promise.all(Object.entries(sourcePaths).map(async ([id, path]) => [id, await readFile(path, 'utf8')])));
  if (hash(tasks.S1) !== '6292f6504a109f702a9a351928ffef3aa049712d7ac1544dd90aa0a81c94efd5') throw new Error('S1 与实际原生成输入不一致。');
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
    purpose: '从真实封架时间错误提炼通用事前核对，再用不同合法情境复查。',
    sourcePaths, taskSha256: Object.fromEntries(Object.entries(tasks).map(([id, text]) => [id, hash(text)])),
    tasks, addition, additionSha256: hash(addition),
    provenance: {
      failure: '../project/运行记录/2026-10-12T17-33-04.755Z-42976b0b-04b4-4d6c-8b13-bfef42a8e443/1-none/output.txt',
      problem: '已确认昨夜子时封住书架，实际稿却称执事今早拉封绳。局部反馈已另行执行；本轮重新生成，不带失败稿、反馈或指定替换句。',
      heldout: 'S2/S3 为人工准备的合法课堂条件，本轮在新生成之前固定，不按其实际输出调整 B。不能代表用户任务分布。',
    },
    calls: order.map((call, index) => {
      const prompt = tasks[call.sample] + (call.method === 'B' ? '\n' + addition : '');
      return { id: `${index + 1}-${call.sample}-${call.method}`, ...call, prompt, promptSha256: hash(prompt) };
    }),
    settings: { skipGitRepoCheck: true, sandboxMode: 'read-only', approvalPolicy: 'never', webSearchMode: 'disabled', modelReasoningEffort: 'low' },
    configuredModel: null, maxCallMs: 180000, scriptRetries: 0,
    commonCriteria: [
      '完整标题与正文，不含后续章节、大纲、说明或自评；正文800—1200汉字，排除标题、标点及非汉字。',
      '读者可从正文理解林青此次目的；有行动中的具体阻碍和可继续追踪的具体未解异常。',
      '林青为青岚宗外门弟子、炼气三层，长远目标筑基，本章没有突破、身份晋升或获取筑基功法。',
      '只按当前输入判断事实与行动条件；未直接表述、直接矛盾、目标缺口和表达偏好分别记录。',
    ],
    sampleCriteria: {
      S1: ['首次入阁，无入阁令，需值守执事放行；为借阅炼气法门而来。', '东侧书架昨夜子时因异响封住，林青得知后才前往；到章末仍封着，不能擅入。'],
      S2: ['首次入阁，无入阁令，需值守执事放行；为借阅炼气法门而来。', '前天夜里封架，昨天傍晚获知，今天清晨前往；保留这组合法时间，不机械改成今早才获知；到章末仍封着，不能擅入。'],
      S3: ['另一较晚时点的独立片段；上月来过并领到仍有效的入阁令，今晨按约来抄录炼气法门，持令即可入阁，无须等执事当面放行。', '从昨夜到章末各处书架均正常开放，没有封禁或封禁消息；阻碍须与此相容，境界保持炼气三层。'],
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
await writeFile(join(runDir, 'config.json'), JSON.stringify({ sdkVersion: sdkPackage.version, nodeVersion: process.version, settings: frozen.settings, configuredModel: null, freezeSha256: frozenHash, maxCallMs: frozen.maxCallMs }, null, 2));
const codex = new Codex(), reports = [];
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

