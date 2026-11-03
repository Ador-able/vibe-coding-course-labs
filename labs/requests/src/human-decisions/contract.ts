import type { ModelMessage } from 'ai';
import type { Chapter, Work } from '../../../../lessons/chapter05/project/src/store.ts';
import type { DraftInput, WorkInput } from '../../../../lessons/chapter05/project/src/schemas.ts';
import type { ModelRequest } from '../tools/contract.ts';

export const SECTIONS = { direction: '选择方向', adoption: '改稿与采用', approval: '批准操作' } as const;
export const DEFAULT_TASK = '请根据现有原文、大纲和设定，帮我写第一章《选拔开端》。开篇的叙事方式我还没有确定，请先读资料，提出两种不同的开场方案，简要说明各自的特点，让我选择后再写正文。收到我的选择后，重新读取当前要求，完成第一章，保存为草稿并读回，最后简要说明完成情况。';
export type Phase = 'direction' | 'approval';
export type Action = { approvalId: string; toolCallId: string; input: DraftInput };
export type Question = { toolCallId: string; question: string; options: { id: 'A' | 'B'; label: string }[] };
export type Decision = { approvalId: string; approved: boolean; reason: string };
export type Materials = { work: WorkInput; actions: { C: DraftInput; D: DraftInput } };
export type HumanEvent = { kind: string; at: string; value: unknown };
export type HumanCall = { id: string; name: string; input: unknown; state: 'proposed' | 'completed' | 'failed'; output?: unknown; error?: string };
export type HumanRun = {
  version: 1; source: 'model-api'; id: string; revision: number; phase: Phase; task: string; configuredModel: string; seedDigest: string;
  state: 'running' | 'awaiting-direction' | 'awaiting-approval' | 'decision-recorded' | 'completed' | 'closed' | 'failed' | 'cancelled' | 'stopped';
  stage: string; messages: ModelMessage[]; requests: ModelRequest[]; calls: HumanCall[]; events: HumanEvent[]; report: string;
  question: Question | null; choice: { id: string; text: string; workRevision: number } | null;
  pending: Action | null; decision: Decision | null; intent: DraftInput | null;
  work: Work; readBack: Chapter | null; startedAt: string; error?: string;
};
export type Classroom = { version: 1; direction: HumanRun; approval: HumanRun };
