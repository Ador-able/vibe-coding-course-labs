import type { RequestRecord, ToolExecution } from '../context/contract.ts';

export const CONDITIONS = { tiered: '逐层读取', full: '提供全文', summary: '只提供本次摘要' };
export type Condition = keyof typeof CONDITIONS;
export const QUESTION = `只依据本轮允许的《凡人修仙传》资料回答两个问题：
1. 第一章中，韩立的大哥做铁匠学徒时每月能拿多少铜板？
2. 三叔在青牛镇临走前，对韩立的活动范围说了什么？

每题简短回答，给出资料编号、短引文与可回查位置。缺少依据就说明不足，不用记忆中的小说补全。`;
export type Material = { path: string; text: string; sha256: string };
export type DisclosureRun = {
  id: string; condition: Condition; startedAt: string; state: 'running' | 'completed' | 'failed';
  requests: RequestRecord[]; tools: ToolExecution[]; reads: (Material & { request: number; callId: string })[];
  supplied: Material[]; answer: string | null; summary?: string; error?: string;
};
