import type { ModelMessage } from 'ai';
import type { Chapter, Work } from '../../../../lessons/chapter05/project/src/store.ts';
import type { WorkInput } from '../../../../lessons/chapter05/project/src/schemas.ts';
import { DEFAULT_TASK as AUTHOR_TASK } from '../human-decisions/contract.ts';
import type { Question } from '../human-decisions/contract.ts';
import type { ModelRequest, ToolCall } from '../tools/contract.ts';

export const SCENARIOS = { A: 'A · 材料足够', B: 'B · 等待作者决定', C: 'C · 受控写入故障', cancel: '取消 · 保留已有稿' } as const;
export type Scenario = keyof typeof SCENARIOS;
const WRITE_TASK = '请根据现有原文、大纲和设定，完成第一章《选拔开端》，保存为草稿，再读取实际保存的标题和正文核对。最后简要说明实际完成的工作、尚未完成的事项，以及继续需要什么。';
export const TASKS: Record<Scenario, string> = {
  A: WRITE_TASK, B: AUTHOR_TASK, C: WRITE_TASK,
  cancel: '请根据当前作品要求，完善已经保存的第一章草稿，保留故事范围与已确认事实，保存修改并读回。最后简要说明实际完成与尚未完成的工作。',
};
export const DEFAULT_LIMITS = { maxSteps: 16, maxSeconds: 0 };
export type Limits = typeof DEFAULT_LIMITS;
export type Materials = { work: WorkInput; initialChapter: { title: string; body: string }; initialChapterSource: { file: string; runId: string; field: string } };
export type StopReason = 'task-completed' | 'author-decision' | 'tool-failure' | 'step-limit' | 'time-limit' | 'user-cancel' | 'service-interrupted' | 'model-incomplete' | 'model-service' | 'readback-failure';
export type Run = {
  version: 1; source: 'model-api'; id: string; scenario: Scenario; task: string; configuredModel: string; seedDigest: string;
  state: 'running' | 'completed' | 'waiting' | 'blocked' | 'limited' | 'cancelled' | 'incomplete' | 'failed' | 'interrupted';
  stage: string; startedAt: string; durationMs?: number; limits: Limits; work: Work;
  initialChapter: Chapter | null; initialChapterSource: Materials['initialChapterSource'] | null; readBack?: Chapter | null;
  calls: ToolCall[]; requests: ModelRequest[]; messages: ModelMessage[]; events: { type: string; at: string; value: unknown }[];
  report: string; question: Question | null; answer: { toolCallId: string; text: string; workRevision: number } | null; finishReason?: string; modelSteps: number;
  stop?: { reason: StopReason; detail: string; remaining: string[] }; error?: string;
};
export type Classroom = { version: 1; runs: Partial<Record<Scenario, Run>> };
