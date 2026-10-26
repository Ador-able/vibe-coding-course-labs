import { FEEDBACK_TARGET } from './contract.ts';
import type { Criterion, TaskRun } from './contract.ts';

export function checkOutput(output: string, original?: string): TaskRun['checks'] {
  const lines = output.trim().split(/\r?\n/);
  const hanCount = (lines.slice(1).join('\n').match(/\p{Script=Han}/gu) ?? []).length;
  const checks = { hanCount, lengthPass: hanCount >= 800 && hanCount <= 1200 };
  if (original === undefined) return checks;
  // 只检查授权段落之外的原字节，不预设段内的改写答案。
  const target = original.split(/\r?\n\s*\r?\n/).find(paragraph => paragraph.includes(FEEDBACK_TARGET));
  const start = target === undefined ? -1 : original.indexOf(target);
  const prefix = original.slice(0, start), suffix = original.slice(start + (target?.length ?? 0));
  const outsideTargetUnchanged = start >= 0 && output.length >= prefix.length + suffix.length && output.startsWith(prefix) && output.endsWith(suffix);
  return { ...checks, outsideTargetUnchanged, targetChanged: outsideTargetUnchanged && output.slice(prefix.length, output.length - suffix.length) !== target };
}

// 判断与原因一起生成，避免只显示一个无法核查的结论。
export function assessRun(run: TaskRun, criteria: Criterion[]) {
  if (run.state !== 'completed') return { label: run.state === 'failed' ? '调用失败' : '尚未完成', reason: run.error || '尚无完整返回，本次不作章稿判断。' };
  const reasons: string[] = [];
  if (!run.checks.lengthPass) reasons.push(`正文 ${run.checks.hanCount} 个汉字，${run.checks.hanCount < 800 ? '少于 800 字下限' : '超过 1200 字上限'}。`);
  if (run.checks.outsideTargetUnchanged === false) reasons.push('规则段以外的全文未保持原样，需要对照改前改后检查。');
  else if (run.checks.targetChanged === false) reasons.push('规则段没有发生修改，尚未完成本轮表达调整。');
  for (const item of criteria) {
    const judgment = run.judgments[item.id];
    if (judgment?.decision === 'fail') reasons.push(`${item.text} 核对依据：${judgment.evidence}`);
  }
  if (reasons.length) return { label: '不符合', reason: reasons.join('\n') };
  const factsChecked = criteria.every(item => run.judgments[item.id]?.decision === 'pass');
  const automated = `正文 ${run.checks.hanCount} 个汉字，符合 800—1200 字。${run.checks.outsideTargetUnchanged === true && run.checks.targetChanged === true ? '规则段已调整，该段以外全文保持原样。' : ''}`;
  return factsChecked ? { label: '符合本轮章稿条件', reason: automated + (run.archive ? '以下保留课堂逐项核对的原句与资料依据。' : '各项人工判断已保存，可展开回查原句依据。') }
    : { label: '待核', reason: automated + '情节与交付条件尚未全部人工核对。' };
}
