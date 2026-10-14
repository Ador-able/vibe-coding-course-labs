import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { z } from 'zod';
import { Store } from './store.js';
import { draftInput, LabError } from './schemas.js';
import { ApprovalTasks, requireCurrentAction, type ApprovalTask, type HumanDecision } from './approval-state.js';
import { actionMessage, approvalMessage, publicFailure, runSdk } from './approval-model.js';

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  db: { type: 'string', default: 'data/04-审批/novel.sqlite' },
  output: { type: 'string' }, 'approval-id': { type: 'string' }, decision: { type: 'string' }, reason: { type: 'string' },
} });
const store = new Store(resolve(values.db!));
const tasks = new ApprovalTasks(store.db);
let runningTaskId: string | null = null;
const inputFile = async (path?: string) => {
  if (!path) throw new LabError('INPUT_REQUIRED', '需要包含完整保存参数的 JSON 文件。');
  return draftInput.parse(JSON.parse(await readFile(path, 'utf8')));
};
const requestedApprovalId = () => z.string().min(1).parse(values['approval-id']);
const reason = () => z.string().trim().min(1).parse(values.reason);
const currentTask = (id?: string) => {
  if (!id) throw new LabError('TASK_REQUIRED', '需要任务编号。');
  return tasks.get(id);
};
try {
  const [command, arg, file] = positionals;
  let result: ApprovalTask;
  switch (command) {
    case 'propose': {
      const input = await inputFile(arg);
      store.getWork(input.workId);
      const messages = [actionMessage(input)];
      let task = tasks.create(randomUUID(), input, messages);
      runningTaskId = task.id;
      const sdk = await runSdk(store, tasks, task.id, messages, 'propose');
      task = tasks.get(task.id);
      result = tasks.save(task, { state: 'awaiting-decision', messages: sdk.messages, pending: sdk.pending });
      break;
    }
    case 'show': result = currentTask(arg); break;
    case 'decide': {
      const task = currentTask(arg);
      const action = requireCurrentAction(task, requestedApprovalId());
      if (task.state !== 'awaiting-decision') throw new LabError('DECISION_STATE', '当前对象已处理或正在运行，请先读取真实状态。');
      const decisionValue = z.enum(['approve', 'deny']).parse(values.decision);
      const decision: HumanDecision = { ...action, approved: decisionValue === 'approve', reason: reason(), decidedBy: '人工CLI教学操作', at: new Date().toISOString() };
      // 保存决定不会执行工具，也不提前给模型写入一个无范围的 true。
      result = tasks.save(task, { state: 'decision-recorded', activeDecision: decision, decisions: [...task.decisions, decision] });
      break;
    }
    case 'resume': {
      let task = currentTask(arg);
      const action = requireCurrentAction(task, requestedApprovalId());
      if (task.state !== 'decision-recorded' || !task.activeDecision || task.activeDecision.approvalId !== action.approvalId) {
        throw new LabError('DECISION_REQUIRED', '当前具体动作尚无可交回的人工决定。');
      }
      const messages = [...task.messages, approvalMessage(action.approvalId, task.activeDecision.approved, task.activeDecision.reason)];
      task = tasks.save(task, { state: 'running', messages });
      runningTaskId = task.id;
      const sdk = await runSdk(store, tasks, task.id, messages, 'resume');
      task = tasks.get(task.id);
      result = tasks.save(task, { state: 'completed', messages: sdk.messages, pending: null, activeDecision: null });
      break;
    }
    case 'replace': {
      let task = currentTask(arg);
      const action = requireCurrentAction(task, requestedApprovalId());
      if (!['awaiting-decision', 'decision-recorded'].includes(task.state)) throw new LabError('DECISION_STATE', '动作已执行或正在运行，不能替换未执行的批准。');
      const input = await inputFile(file);
      if (input.workId !== task.intent.workId || input.chapterNumber !== task.intent.chapterNumber) throw new LabError('TASK_MISMATCH', '新动作需要对应同一作品和目标章。');
      if (isDeepStrictEqual(input, action.input)) throw new LabError('ACTION_UNCHANGED', '参数尚未改变。');
      const explanation = reason();
      const closureReason = `人已撤回原动作并提出不同参数。原决定${task.activeDecision?.approved ? '曾批准但尚未执行' : '尚未用于执行'}，不得用于新动作。理由：${explanation}`;
      const messages = [...task.messages, approvalMessage(action.approvalId, false, closureReason)];
      const closure = { action, priorDecision: task.activeDecision, replacementInput: input, reason: closureReason };
      task = tasks.save(task, { state: 'running', messages, activeDecision: null,
        events: [...task.events, { kind: 'human-replacement', at: new Date().toISOString(), value: closure }] });
      runningTaskId = task.id;
      // 先让 SDK 关闭原请求，再把人的新要求交给 SDK 提议真正的新动作。
      const closed = await runSdk(store, tasks, task.id, messages, 'close');
      task = tasks.get(task.id);
      task = tasks.save(task, { state: 'closed', messages: closed.messages, pending: null });
      const newMessages = [...closed.messages, actionMessage(input)];
      task = tasks.save(task, { state: 'running', intent: input, messages: newMessages });
      const proposed = await runSdk(store, tasks, task.id, newMessages, 'propose');
      task = tasks.get(task.id);
      result = tasks.save(task, { state: 'awaiting-decision', messages: proposed.messages, pending: proposed.pending, activeDecision: null });
      break;
    }
    default: throw new LabError('COMMAND', '用法：pnpm approval propose 参数.json | show 任务 | decide 任务 --approval-id 请求 --decision approve或deny --reason 理由 | resume 任务 --approval-id 请求 | replace 任务 新参数.json --approval-id 原请求 --reason 理由 [--db 路径]');
  }
  const text = JSON.stringify(result, null, 2) + '\n';
  if (values.output) await writeFile(resolve(values.output), text, 'utf8');
  else process.stdout.write(text);
} catch (error) {
  const failure = publicFailure(error);
  if (runningTaskId) {
    const task = tasks.get(runningTaskId);
    tasks.save(task, { state: 'failed', error: failure });
  }
  console.error(JSON.stringify(failure));
  process.exitCode = 1;
} finally { store.close(); }
