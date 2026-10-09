import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { Codex } from '@openai/codex-sdk';

const base = new URL('./', import.meta.url);
const packagePath = createRequire(import.meta.url).resolve('@openai/codex/package.json');
const pkgRequire = createRequire(packagePath);
const targets = { 'win32-x64': ['@openai/codex-win32-x64', 'x86_64-pc-windows-msvc', 'codex.exe'], 'win32-arm64': ['@openai/codex-win32-arm64', 'aarch64-pc-windows-msvc', 'codex.exe'], 'linux-x64': ['@openai/codex-linux-x64', 'x86_64-unknown-linux-musl', 'codex'], 'linux-arm64': ['@openai/codex-linux-arm64', 'aarch64-unknown-linux-musl', 'codex'], 'darwin-x64': ['@openai/codex-darwin-x64', 'x86_64-apple-darwin', 'codex'], 'darwin-arm64': ['@openai/codex-darwin-arm64', 'aarch64-apple-darwin', 'codex'] };
const target = targets[`${process.platform}-${process.arch}`];
if (!target) throw new Error('此练习尚未记录当前平台的CLI解析入口');
const platformPkg = pkgRequire.resolve(`${target[0]}/package.json`);
const executable = path.join(path.dirname(platformPkg), 'vendor', target[1], 'bin', target[2]);
const version = spawnSync(executable, ['--version'], { encoding: 'utf8', windowsHide: true });
if (version.status !== 0 || !version.stdout.includes('0.160.0')) throw new Error(`实际CLI版本不符合练习固定条件：${version.error ? String(version.error) : version.stderr}`);
const frozen = JSON.parse(await fs.readFile(new URL('frozen-inputs.json', base), 'utf8'));
const rootOutput = new URL(`runs/${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}/`, base);
await fs.mkdir(rootOutput, { recursive: true });
const context = { node: process.version, sdkVersion: '0.160.0', actualCliVersion: version.stdout.trim(), actualCliPath: executable, actualCliSha256: crypto.createHash('sha256').update(await fs.readFile(executable)).digest('hex'), modelConfigured: null, modelNameEvidence: '未显式设置型号；本次四个会话沿用同一现有入口配置，不据默认值猜型号', timeoutMilliseconds: 180000, newIndependentThreads: true };
await fs.writeFile(new URL('runtime.json', rootOutput), JSON.stringify(context, null, 2));

for (const condition of frozen.conditions) {
  const conditionOutput = new URL(`${condition.id}/`, rootOutput);
  await fs.mkdir(conditionOutput, { recursive: true });
  const workingDirectory = fileURLToPath(new URL(`materials/${condition.id}/`, base));
  // 运行前核对冻结的全部输入，不在看过结果后替换条件。
  for (const [name, file] of Object.entries(condition.files)) {
    const actual = await fs.readFile(path.join(workingDirectory, name), 'utf8');
    if (actual !== file.content) throw new Error(`冻结材料已改变：${condition.id}/${name}`);
  }
  const options = { workingDirectory, skipGitRepoCheck: true, sandboxMode: 'read-only', approvalPolicy: 'never', networkAccessEnabled: false, webSearchMode: 'disabled', modelReasoningEffort: 'low' };
  await fs.writeFile(new URL('input.json', conditionOutput), JSON.stringify({ ...condition, workingDirectory, options }, null, 2));
  const codex = new Codex({ codexPathOverride: executable });
  const thread = codex.startThread(options);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), context.timeoutMilliseconds);
  const began = Date.now();
  let finalResponse = '';
  let usage = null;
  let turnCompleted = false;
  let error = null;
  const publicEvents = [];
  let reasoningEventsOmitted = 0;
  try {
    const streamed = await thread.runStreamed(condition.prompt, { signal: controller.signal });
    for await (const event of streamed.events) {
      // 只保存公开动作和回复，不把模型内部思维作为教学依据。
      if (event.item?.type === 'reasoning') { reasoningEventsOmitted++; continue; }
      publicEvents.push({ at: new Date().toISOString(), event });
      if (event.type === 'item.completed' && event.item.type === 'agent_message') finalResponse = event.item.text;
      if (event.type === 'turn.completed') { turnCompleted = true; usage = event.usage; }
      if (event.type === 'turn.failed') error = event.error;
      if (event.type === 'error') error = event.message;
    }
  } catch (caught) {
    error = String(caught);
  } finally {
    clearTimeout(timer);
  }
  await fs.writeFile(new URL('events.jsonl', conditionOutput), publicEvents.map((event) => JSON.stringify(event)).join('\n') + '\n');
  await fs.writeFile(new URL('final-response.txt', conditionOutput), finalResponse);
  const report = { conditionId: condition.id, title: condition.title, threadId: thread.id, turnCompleted, error, aborted: controller.signal.aborted, elapsedMilliseconds: Date.now() - began, usage, reasoningEventsOmitted, publicCompletedItems: publicEvents.filter(({ event }) => event.type === 'item.completed').map(({ event }) => ({ id: event.item.id, type: event.item.type, status: event.item.status, exitCode: event.item.exit_code })), finalResponseCharacters: finalResponse.length, finalResponseSha256: crypto.createHash('sha256').update(finalResponse).digest('hex'), novelSavedOrAdopted: false };
  await fs.writeFile(new URL('report.json', conditionOutput), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ directory: fileURLToPath(conditionOutput), ...report }));
}
console.log(JSON.stringify({ allRecordsDirectory: fileURLToPath(rootOutput) }));
