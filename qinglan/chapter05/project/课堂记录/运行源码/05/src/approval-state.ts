import type { ModelMessage } from 'ai';
import type { DatabaseSync } from 'node:sqlite';
import { LabError, type DraftInput } from './schemas.js';

export type PendingAction = {
  approvalId: string;
  toolCallId: string;
  toolName: 'save_draft';
  input: DraftInput;
};
export type HumanDecision = PendingAction & {
  approved: boolean;
  reason: string;
  decidedBy: '人工CLI教学操作';
  at: string;
};
export type ApprovalTask = {
  id: string;
  revision: number;
  state: 'running' | 'awaiting-decision' | 'decision-recorded' | 'closed' | 'completed' | 'failed';
  intent: DraftInput;
  messages: ModelMessage[];
  pending: PendingAction | null;
  activeDecision: HumanDecision | null;
  decisions: HumanDecision[];
  events: { kind: string; at: string; value: unknown }[];
  error: { code: string; message: string; statusCode?: number } | null;
  createdAt: string;
  updatedAt: string;
};

export class ApprovalTasks {
  constructor(private readonly db: DatabaseSync) {
    db.exec('CREATE TABLE IF NOT EXISTS approval_tasks(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, content TEXT NOT NULL) STRICT');
  }

  create(id: string, intent: DraftInput, messages: ModelMessage[]): ApprovalTask {
    const now = new Date().toISOString();
    const task: ApprovalTask = {
      id, revision: 1, state: 'running', intent, messages, pending: null, activeDecision: null,
      decisions: [], events: [], error: null, createdAt: now, updatedAt: now,
    };
    this.db.prepare('INSERT INTO approval_tasks VALUES(?,?,?)').run(id, task.revision, JSON.stringify(task));
    return task;
  }

  get(id: string): ApprovalTask {
    const row = this.db.prepare('SELECT content FROM approval_tasks WHERE id=?').get(id);
    if (!row) throw new LabError('TASK_NOT_FOUND', '没有这项审批任务。');
    return JSON.parse(row.content as string) as ApprovalTask;
  }

  save(current: ApprovalTask, change: Partial<Omit<ApprovalTask, 'id' | 'revision' | 'createdAt'>>): ApprovalTask {
    const next = { ...current, ...change, revision: current.revision + 1, updatedAt: new Date().toISOString() };
    // 同一待决对象不能被两个入口分别改写，旧读数必须重新读取。
    const result = this.db.prepare('UPDATE approval_tasks SET revision=?,content=? WHERE id=? AND revision=?')
      .run(next.revision, JSON.stringify(next), next.id, current.revision);
    if (result.changes !== 1) throw new LabError('STALE_TASK', '审批任务已改变，请重新读取当前对象。');
    return next;
  }

  append(id: string, kind: string, value: unknown): ApprovalTask {
    const task = this.get(id);
    return this.save(task, { events: [...task.events, { kind, at: new Date().toISOString(), value }] });
  }
}

export function requireCurrentAction(task: ApprovalTask, approvalId: string): PendingAction {
  if (!task.pending || task.pending.approvalId !== approvalId) {
    throw new LabError('APPROVAL_NOT_CURRENT', '这项批准不对应当前待决动作，请读取当前动作后重新判断。');
  }
  return task.pending;
}
