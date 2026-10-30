import type { ToolCall, ToolRun } from '../tools/contract.ts';

export const MODES = { workflow: '固定基础读取', agent: 'Agent', mixed: '混合方式' } as const;
export const SCENARIOS = { known: '路径已知', explore: '根据线索补查' } as const;
export type Mode = keyof typeof MODES;
export type Scenario = keyof typeof SCENARIOS;
export type Variant = 'key' | 'time';
export type Materials = {
  provenance: string;
  work: { title: string; requirements: string[] };
  chapters: Record<Variant, { title: string; body: string }>;
  documents: { id: string; title: string; description: string; body: string }[];
  tasks: Record<Scenario, string>;
  checks: Record<Scenario, Record<Variant, string>>;
};
export type ControlGroup = ToolRun & { mode: Mode; provided: ToolCall[] };
export type ControlRun = {
  version: 1; source: 'model-api'; id: string; scenario: Scenario; variant: Variant; task: string;
  seedDigest: string; configuredModel: string; materials: Materials; startedAt: string;
  state: 'running' | 'completed' | 'cancelled' | 'failed'; stage: string; groups: ControlGroup[]; error?: string;
};
export type Classroom = { version: 1; runs: ControlRun[] };
