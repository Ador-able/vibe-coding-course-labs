import { EDIT } from './contract.ts';
import type { TaskRun } from './contract.ts';

export function checkOutput(output: string, original?: string) {
  const lines = output.trim().split(/\r?\n/);
  const hanCount = (lines.slice(1).join('\n').match(/\p{Script=Han}/gu) ?? []).length;
  return { hanCount, lengthPass: hanCount >= 800 && hanCount <= 1200,
    ...(original === undefined ? {} : { exactEdit: original.includes(EDIT.before) && output === original.replace(EDIT.before, EDIT.after) }) };
}
// 缺失用量保持未知；缓存输入和推理输出是细分，不再叠加。
export function totals(runs: TaskRun[]) {
  const unique = [...new Map(runs.map(run => [run.id, run])).values()];
  const sum = (get: (run: TaskRun) => unknown) => {
    const values = unique.map(get);
    return values.every(value => typeof value === 'number' && Number.isFinite(value)) ? (values as number[]).reduce((a, b) => a + b, 0) : null;
  };
  const usage = (run: TaskRun) => run.request.usage as { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number }; completion_tokens_details?: { reasoning_tokens?: number } } | undefined;
  return { calls: unique.length, durationMs: sum(run => run.request.durationMs),
    input: sum(run => usage(run)?.prompt_tokens), output: sum(run => usage(run)?.completion_tokens),
    cached: sum(run => usage(run)?.prompt_tokens_details?.cached_tokens), reasoning: sum(run => usage(run)?.completion_tokens_details?.reasoning_tokens) };
}
