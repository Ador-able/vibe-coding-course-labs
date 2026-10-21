import type { RequestRecord } from '../context/contract.ts';

export const LESSONS = {
  goals: { name: '任务验收', description: '把用途、事实、写法与交付分开，再按相同要求检查实际章稿。', action: '生成章稿' },
  examples: { name: '样例对照', description: '固定同一任务，分别不提供样例、提供冲突样例和相容样例。', action: '运行三种条件' },
  feedback: { name: '局部反馈', description: '用一份真实章稿，只替换指定对白，再比较完整返回。', action: '按反馈修改' },
  evaluation: { name: '评估样本', description: '先固定样本与判断条件，再比较原任务和追加事前核对的做法。', action: '运行五份样本' },
  cost: { name: '合格率与总成本', description: 'A 保留初稿；B 在同一份初稿上增加核对，比较结果与整条路径的消耗。', action: '生成初稿并核对' },
} as const;
export type Lesson = keyof typeof LESSONS;
export type CaseId = 'S1' | 'S2' | 'S3';
export type Method = 'none' | 'conflict' | 'consistent' | 'A' | 'B';
export type RunInput = { lesson: Lesson; caseId: CaseId; method: Method; batchId: string; parentId?: string; effort?: 'low' | 'high' | 'max' };
export type Criterion = { id: string; text: string };
export const EDIT = { before: '正午前到崖顶，才够成为正式弟子的时间条件。', after: '想当正式弟子，就得在正午前到崖顶。' };
export type Judgment = { decision: 'pass' | 'fail' | 'pending'; evidence: string };
export type TaskRun = RunInput & {
  id: string; startedAt: string; configuredModel: string; baseUrl: string;
  state: 'running' | 'completed' | 'failed'; output: string;
  request: RequestRecord; error?: string;
  checks: { hanCount: number; lengthPass: boolean; exactEdit?: boolean };
  judgments: Record<string, Judgment>;
};
export const PLAN: Record<Lesson, { caseId: CaseId; method: Method }[]> = {
  goals: [{ caseId: 'S1', method: 'none' }],
  examples: ['none', 'conflict', 'consistent'].map(method => ({ caseId: 'S1', method: method as Method })),
  feedback: [{ caseId: 'S1', method: 'none' }],
  evaluation: [ ['S1', 'B'], ['S2', 'A'], ['S3', 'B'], ['S2', 'B'], ['S3', 'A'] ].map(([caseId, method]) => ({ caseId: caseId as CaseId, method: method as Method })),
  cost: [{ caseId: 'S2', method: 'A' }, { caseId: 'S2', method: 'B' }],
};
export const METHOD_NAMES: Record<Method, string> = { none: '无样例', conflict: '冲突样例', consistent: '相容样例', A: 'A', B: 'B' };
