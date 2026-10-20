import type { RequestRecord, ToolExecution } from '../context/contract.ts';

export const CONDITIONS = { tiered: '逐层读取', full: '提供全文', summary: '只提供本次摘要' };
export type Condition = keyof typeof CONDITIONS;
export const QUESTION = `请围绕当前工作页续写韩立安排下一轮催药的一场戏，约300字。天色转阴，他需要兼顾修炼与保密；用具体行动表现他的取舍。

正文之后简列所用依据，以及定稿后需要同步到档案的变化。`;
export type Material = { path: string; text: string; sha256: string };
export type DisclosureRun = {
  id: string; condition: Condition; startedAt: string; state: 'running' | 'completed' | 'failed';
  requests: RequestRecord[]; tools: ToolExecution[]; reads: (Material & { request: number; callId: string })[];
  supplied: Material[]; answer: string | null; summary?: string; error?: string;
};
