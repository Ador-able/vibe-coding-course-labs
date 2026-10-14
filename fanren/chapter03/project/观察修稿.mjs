import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Codex } from '@openai/codex-sdk';

const root = dirname(fileURLToPath(import.meta.url));
const materialRoot = join(root, '自动记忆练习');
const id = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`;
const dir = join(materialRoot, '运行记录', id);
await mkdir(dir, { recursive: true });
const prompt = await readFile(join(materialRoot, '第一次修稿.txt'), 'utf8');
const expected = await readFile(join(materialRoot, '原句-C01.txt'), 'utf8');
// 只验证修稿与反馈，不把练习写入日常记忆库，也不模拟自动记忆产物。
const config = { features: { shell_tool: false }, memories: { use_memories: false, generate_memories: false } };
const threadOptions = { workingDirectory: root, skipGitRepoCheck: true, sandboxMode: 'read-only', approvalPolicy: 'never', webSearchMode: 'disabled' };
const thread = new Codex({ config }).startThread(threadOptions);
const report = { id, startedAt: new Date().toISOString(), executionGitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), runnerSha256: createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'), config, threadOptions, turns: [], automaticSave: '本轮关闭生成，未验证自动保存、选入或维护' };
async function runTurn(name, input) {
  await writeFile(join(dir, `${name}-input.txt`), input);
  const { events } = await thread.runStreamed(input);
  const result = { name, state: 'running', threadId: null, usage: null, output: '' };
  try {
    for await (const event of events) {
      await appendFile(join(dir, `${name}-events.jsonl`), `${JSON.stringify(event)}\n`);
      if (event.type === 'thread.started') result.threadId = event.thread_id;
      if (event.type === 'item.completed' && event.item.type === 'agent_message') result.output = event.item.text;
      if (event.type === 'turn.completed') { result.state = 'completed'; result.usage = event.usage; }
      if (event.type === 'turn.failed') throw new Error(JSON.stringify(event.error));
    }
    if (!result.output.trim()) throw new Error('没有取得正文');
  } catch (error) { result.state = 'failed'; result.error = String(error); }
  await writeFile(join(dir, `${name}-output.txt`), result.output);
  report.turns.push(result);
  await writeFile(join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (result.state === 'failed') throw new Error(result.error);
  return result;
}
const edit = await runTurn('修稿', prompt);
report.onlyAuthorizedChange = edit.output.trim() === expected.trim();
if (report.onlyAuthorizedChange) await runTurn('反馈', await readFile(join(materialRoot, '核对后反馈.txt'), 'utf8'));
report.finishedAt = new Date().toISOString();
await writeFile(join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ dir, onlyAuthorizedChange: report.onlyAuthorizedChange, automaticSave: report.automaticSave }));
if (!report.onlyAuthorizedChange) process.exitCode = 1;
