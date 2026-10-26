import type { RequestRecord } from '../context/contract.ts';

export const LESSONS = {
  goals: { name: '任务验收', description: '把用途、事实、写法与交付分开，再按相同要求检查实际章稿。', action: '生成章稿' },
  examples: { name: '样例对照', description: '固定同一任务，分别不提供样例、提供冲突样例和相容样例。', action: '运行三种条件' },
  feedback: { name: '局部反馈', description: '指出规则对白的问题和期望，让 AI 改写，再核对表达与保留范围。', action: '按反馈修改' },
  evaluation: { name: '评估样本', description: '先固定样本与判断条件，再比较原任务和追加事前核对的做法。', action: '运行五份样本' },
} as const;
export type Lesson = keyof typeof LESSONS;
export type CaseId = 'S1' | 'S2' | 'S3';
export type Method = 'none' | 'conflict' | 'consistent' | 'A' | 'B';
export type RunInput = { lesson: Lesson; caseId: CaseId; method: Method; batchId: string };
export type Criterion = { id: string; text: string };
export const FEEDBACK_TARGET = '正午前到崖顶，才够成为正式弟子的时间条件。';
export const FEEDBACK_CRITERION: Criterion = { id: 'expression', text: '规则对白比原稿更直接，像岳堂主当场宣布要求；考核条件保持。' };
export type Judgment = { decision: 'pass' | 'fail' | 'pending'; evidence: string };
export type TaskRun = RunInput & {
  id: string; startedAt: string; configuredModel: string; baseUrl: string;
  state: 'running' | 'completed' | 'failed'; output: string;
  request: RequestRecord; error?: string;
  checks: { hanCount: number; lengthPass: boolean; targetChanged?: boolean; outsideTargetUnchanged?: boolean };
  judgments: Record<string, Judgment>;
  archive?: { path: string; report: Record<string, unknown>; assessment: unknown };
};
export const PLAN: Record<Lesson, { caseId: CaseId; method: Method }[]> = {
  goals: [{ caseId: 'S1', method: 'none' }],
  examples: ['none', 'conflict', 'consistent'].map(method => ({ caseId: 'S1', method: method as Method })),
  feedback: [{ caseId: 'S1', method: 'none' }],
  evaluation: [ ['S1', 'B'], ['S2', 'A'], ['S3', 'B'], ['S2', 'B'], ['S3', 'A'] ].map(([caseId, method]) => ({ caseId: caseId as CaseId, method: method as Method })),
};
export const METHOD_NAMES: Record<Method, string> = { none: '无样例', conflict: '冲突样例', consistent: '相容样例', A: 'A', B: 'B' };
