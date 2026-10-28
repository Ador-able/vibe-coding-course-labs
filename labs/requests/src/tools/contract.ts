export const TOOL_SETS = { separate: '分散读取', combined: '组合读取' } as const;
export type ToolSetName = keyof typeof TOOL_SETS;
export type ToolDefinition = { name: string; description: string; parameters: Record<string, unknown> };
export const DEFAULT_TASK = '请依据当前作品要求和已有章节，完成第一章《选拔开端》的完整草稿，保存为待审草稿，再确认实际保存的标题和正文。最后简要说明完成情况，供我阅读核对。';
export const MAX_STEPS = 20;
export type Draft = { number: number; revision: number; workRevision: number; status: 'draft'; title: string; body: string };
export type ToolCall = {
  id: string; name: string; input: unknown; state: 'running' | 'completed' | 'failed';
  output?: unknown; error?: string;
};
export type ModelRequest = {
  body: string; startedAt: string; durationMs?: number; httpStatus?: number;
  response?: unknown; error?: string;
};
export type ToolsRun = {
  version: 1; source: 'model-api'; id: string; toolSet: ToolSetName; task: string;
  configuredModel: string; seedDigest: string; startedAt: string;
  state: 'running' | 'completed' | 'cancelled' | 'stopped' | 'failed'; stage: string;
  calls: ToolCall[]; requests: ModelRequest[]; report: string; readBack: Draft | null;
  usage: { input: number | null; output: number | null; cached: number | null; reasoning: number | null };
  durationMs?: number; finishReason?: string; error?: string;
};
