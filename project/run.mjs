import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { Codex } from '@openai/codex-sdk';

const base = path.dirname(fileURLToPath(import.meta.url));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const platformTargets = {
  'win32-x64': ['@openai/codex-win32-x64', 'x86_64-pc-windows-msvc', 'codex.exe'],
  'win32-arm64': ['@openai/codex-win32-arm64', 'aarch64-pc-windows-msvc', 'codex.exe'],
  'linux-x64': ['@openai/codex-linux-x64', 'x86_64-unknown-linux-musl', 'codex'],
  'linux-arm64': ['@openai/codex-linux-arm64', 'aarch64-unknown-linux-musl', 'codex'],
  'darwin-x64': ['@openai/codex-darwin-x64', 'x86_64-apple-darwin', 'codex'],
  'darwin-arm64': ['@openai/codex-darwin-arm64', 'aarch64-apple-darwin', 'codex'],
};
const target = platformTargets[`${process.platform}-${process.arch}`];
if (!target) throw new Error('当前平台没有本练习固定的运行包');
const require = createRequire(import.meta.url);
const cliPackage = require.resolve('@openai/codex/package.json');
const cliRequire = createRequire(cliPackage);
const platformPackage = cliRequire.resolve(`${target[0]}/package.json`);
const executable = path.join(path.dirname(platformPackage), 'vendor', target[1], 'bin', target[2]);
const version = spawnSync(executable, ['--version'], { encoding: 'utf8', windowsHide: true });
if (version.status !== 0 || !version.stdout.includes('0.160.0')) throw new Error('未找到固定的 Codex 0.160.0 运行包');

const phase = process.argv[2];
if (!['wait', 'continue'].includes(phase)) throw new Error('使用 pnpm run wait 或 pnpm run continue <练习编号>');
let runId = process.argv[3];
if (phase === 'wait') runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
if (!runId || !/^[a-zA-Z0-9-]+$/.test(runId)) throw new Error('请提供 wait 返回的练习编号');
const runDir = path.join(base, 'runs', runId);
const materials = path.join(runDir, 'materials');
const phaseDir = path.join(runDir, phase);
await fs.mkdir(phaseDir, { recursive: true });
if (phase === 'wait') {
  await fs.cp(path.join(base, 'baseline'), materials, { recursive: true, errorOnExist: true });
} else {
  const takeover = JSON.parse(await fs.readFile(path.join(runDir, '人工接管记录.json'), 'utf8'));
  if (takeover.runId !== runId) throw new Error('人工接管记录不属于本次练习');
  for (const entry of takeover.changedFiles) {
    if (sha(await fs.readFile(path.join(materials, entry.name))) !== entry.after.sha256) throw new Error(`接管后材料另有变化，请先核对：${entry.name}`);
  }
  try { await fs.access(path.join(phaseDir, 'report.json')); throw new Error('本次接续已有记录；请另开一次完整练习，保留已有结果'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const beforeRead = [];
for (const name of await fs.readdir(materials)) {
  const bytes = await fs.readFile(path.join(materials, name));
  beforeRead.push({ name, bytes: bytes.length, sha256: sha(bytes), text: bytes.toString('utf8') });
}
await fs.writeFile(path.join(phaseDir, '运行前实际材料.json'), json(beforeRead));
const options = {
  workingDirectory: materials,
  skipGitRepoCheck: true,
  sandboxMode: 'read-only',
  approvalPolicy: 'never',
  networkAccessEnabled: false,
  webSearchMode: 'disabled',
  modelReasoningEffort: 'low',
};
const codex = new Codex({ codexPathOverride: executable });
const earlier = phase === 'continue' ? JSON.parse(await fs.readFile(path.join(runDir, 'wait', 'report.json'), 'utf8')) : null;
if (earlier && (!earlier.threadId || !earlier.completed || earlier.error)) throw new Error('待选轮没有完整结束，不能把失败记录当作可接续结果');
const thread = earlier ? codex.resumeThread(earlier.threadId, options) : codex.startThread(options);
const prompt = phase === 'wait'
  ? `请用本机已有的文件读取能力，完整读取当前目录中的 background.md、chapter-one.md、current-task.md、plans.md。先说明本章调查方向为什么需要作者决定，指出 A 和 B 还未采用，然后停下来等作者决定。不要写第二章，不修改任何文件，也不要自行采用方案。请在公开回答里引用第一章最后一句，并说明各文件已读取还是无法读取；没有读取到正文时不得猜测内容。文件读取若遇到工具失败，说明真实失败，并可使用本机已有的另一种读取入口；不要新增服务器或修改配置。`
  : `先不要依据上一轮记住的第一章和任务直接续写。编者已经人工保存了新的 chapter-one.md、current-task.md 和 human-decision.md；旧聊天仅保留历史。请用本机已有的文件读取能力重新完整读取这三份当前文件，并重读 background.md 与 plans.md。确认本轮以这些实际文件为准，再写完整第二章。不要修改文件；正文通过本轮最终回答交回，由实验记录程序保存为独立草稿。最终回答分为“重读与决定核对”“第二章完整草稿”两部分：核对部分逐字引用人的改稿段落并区分原有事实、新加入的创作设定和仍未知的情况；随后给出约800至1200个中文字符的完整第二章。文学采用仍由人决定，不声称草稿已经采用、入库或发布。若无法取得实际材料，停止续写并说明原因；读取失败可以尝试本机已有另一入口，但不新增服务、不改全局配置。`;
await fs.writeFile(path.join(phaseDir, 'prompt.txt'), prompt + '\n');
await fs.writeFile(path.join(phaseDir, 'thread-options.json'), json({ ...options, inheritedConversation: !!earlier, resumedThreadId: earlier?.threadId ?? null, requestedModel: null, modelNote: '未显式覆盖本机模型设置，不能由脚本配置推断实际模型 ID', cliVersion: version.stdout.trim(), nodeVersion: process.version }));
const startedAt = new Date().toISOString();
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 180000);
let finalResponse = '', usage = null, completed = false, error = null, publicEventCount = 0, omittedReasoningEvents = 0;
try {
  const streamed = await thread.runStreamed(prompt, { signal: controller.signal });
  for await (const event of streamed.events) {
    if (event.item?.type === 'reasoning') { omittedReasoningEvents++; continue; }
    await fs.appendFile(path.join(phaseDir, 'public-events.jsonl'), JSON.stringify({ at: new Date().toISOString(), event }) + '\n');
    publicEventCount++;
    if (event.type === 'item.completed' && event.item.type === 'agent_message') finalResponse = event.item.text;
    if (event.type === 'turn.completed') { completed = true; usage = event.usage; }
    if (event.type === 'turn.failed') error = event.error;
    if (event.type === 'error') error = event.message;
  }
} catch (caught) { error = { name: caught.name, message: caught.message }; }
finally { clearTimeout(timer); }
await fs.writeFile(path.join(phaseDir, 'final-response.md'), finalResponse);
const report = { phase, runId, threadId: thread.id, resumedThreadId: earlier?.threadId ?? null, startedAt, finishedAt: new Date().toISOString(), completed, error, usage, publicEventCount, omittedReasoningEvents, finalResponseBytes: Buffer.byteLength(finalResponse), finalResponseSha256: sha(finalResponse), savedBy: '实验记录程序将最终回答保存为本地独立草稿，不是模型写文件或业务入库', scope: '公开事件不含推理内容；只读本地材料；未运行对外发送、业务采用、数据库恢复或运行中取消' };
await fs.writeFile(path.join(phaseDir, 'report.json'), json(report));
console.log(json({ ...report, materialsPath: materials, nextCommand: phase === 'wait' ? `pnpm run takeover ${runId}` : '打开完整草稿并人工判断；不自动采用' }));
if (!completed || error) process.exitCode = 1;
