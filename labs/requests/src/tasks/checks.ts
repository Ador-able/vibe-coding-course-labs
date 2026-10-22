import { EDIT } from './contract.ts';
import type { Criterion, TaskRun } from './contract.ts';

export function checkOutput(output: string, original?: string) {
  const lines = output.trim().split(/\r?\n/);
  const hanCount = (lines.slice(1).join('\n').match(/\p{Script=Han}/gu) ?? []).length;
  return { hanCount, lengthPass: hanCount >= 800 && hanCount <= 1200,
    ...(original === undefined ? {} : { exactEdit: original.includes(EDIT.before) && output === original.replace(EDIT.before, EDIT.after) }) };
}

// 判断与原因一起生成，避免只显示一个无法核查的结论。
export function assessRun(run: TaskRun, criteria: Criterion[]) {
  if (run.state !== 'completed') return { label: run.state === 'failed' ? '调用失败' : '尚未完成', reason: run.error || '尚无完整返回，本次不作章稿判断。' };
  const reasons: string[] = [];
  if (!run.checks.lengthPass) reasons.push(`正文 ${run.checks.hanCount} 个汉字，${run.checks.hanCount < 800 ? '少于 800 字下限' : '超过 1200 字上限'}。`);
  if (run.checks.exactEdit === false) reasons.push('全文与“原稿只替换指定句”的结果不同，需要检查指定句及其余文字。');
  for (const item of criteria) {
    const judgment = run.judgments[item.id];
    if (judgment?.decision === 'fail') reasons.push(`${item.text} 核对依据：${judgment.evidence}`);
  }
  if (reasons.length) return { label: '不符合', reason: reasons.join('\n') };
  const factsChecked = criteria.every(item => run.judgments[item.id]?.decision === 'pass');
  const automated = `正文 ${run.checks.hanCount} 个汉字，符合 800—1200 字。${run.checks.exactEdit === true ? '全文只替换了指定句。' : ''}`;
  return factsChecked ? { label: '符合本轮章稿条件', reason: automated + (run.archive ? '以下保留课堂逐项核对的原句与资料依据。' : '各项人工判断已保存，可展开回查原句依据。') }
    : { label: '待核', reason: automated + '情节与交付条件尚未全部人工核对。' };
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
