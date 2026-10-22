import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkOutput } from './checks.ts';
import type { CaseId, Judgment, Lesson, Method, TaskRun } from './contract.ts';

const exampleDirectory = '运行记录/2026-10-14T15-59-44.749Z-ebe5037b-3a15-4793-937d-90905b86ebc6';
const directories = {
  goals: exampleDirectory, examples: exampleDirectory,
  feedback: 'feedback/运行记录/2026-10-15T00-29-11.325Z-19ca90b9-bb90-49a1-a4b1-58e7452fbfd1',
  evaluation: 'evaluation/运行记录/2026-10-15T00-34-23.662Z-cd7031af-81a6-4aa3-8e9f-71b5fa29d01e',
  cost: 'cost/运行记录/2026-10-15T00-43-25.231Z-225f2b89-a862-4244-ac6a-d14aebf9496b',
};
type Report = Record<string, unknown> & {
  id?: string; sample?: CaseId; condition?: Method; method?: Method; pair?: string; step?: string;
  state: 'completed' | 'failed'; startedAt: string; elapsedMs: number; failure?: { message: string };
  usageEvents: Record<string, number>[];
};

// 从文章所用的原件读取，不创建新调用，也不改写历史报告。
export async function loadClassroom(project: string, lesson: Lesson): Promise<TaskRun[]> {
  const read = (path: string) => readFile(join(project, path), 'utf8');
  const directory = directories[lesson];
  const assessment = JSON.parse(await read(`课堂记录/凡人原文-20261015/${({ goals: '任务验收记录', examples: '样例对照核对', feedback: '局部反馈核对', evaluation: '评估样本核对', cost: '成本路径核对' }[lesson])}.json`));
  const reviews: Record<string, Record<string, { decision: Judgment['decision']; quotes: string[]; source: string; explanation: string }>> = JSON.parse(await read('课堂记录/凡人原文-20261015/逐项核对.json'));
  const reports: Report[] = lesson === 'feedback'
    ? [JSON.parse(await read(`${directory}/report.json`))]
    : JSON.parse(await read(`${directory}/reports.json`));
  const selected = lesson === 'goals' ? reports.slice(0, 1) : reports;
  return Promise.all(selected.map(async report => {
    const path = lesson === 'feedback' ? directory : `${directory}/${report.id}`;
    const [prompt, output, original] = await Promise.all([
      read(`${path}/prompt.txt`), read(`${path}/output.txt`),
      lesson === 'feedback' ? read(`${path}/original.txt`) : Promise.resolve(undefined),
    ]);
    const id = `classroom-${lesson}-${report.id ?? 'feedback'}`;
    const batchId = `classroom-${lesson}`;
    const method = lesson === 'cost' ? report.step === 'draft' ? 'A' : 'B' : report.condition ?? report.method ?? 'none';
    // 公开用量转换为共用统计字段；没有上报的项目仍为未知。
    const sum = (key: string) => report.usageEvents.length && report.usageEvents.every(event => typeof event[key] === 'number')
      ? report.usageEvents.reduce((total, event) => total + event[key], 0) : undefined;
    return {
      id, batchId, lesson, caseId: report.sample ?? 'S1', method,
      ...(lesson === 'cost' && method === 'B' ? { parentId: `classroom-cost-${report.pair}-draft` } : {}),
      startedAt: report.startedAt, configuredModel: '', baseUrl: '', state: report.state,
      output, ...(report.state === 'failed' ? { error: '本次历史调用失败，未取得完整章稿；原始错误见运行报告。' } : {}),
      checks: checkOutput(output, original), judgments: Object.fromEntries(Object.entries(reviews[report.id ?? 'feedback'] ?? {}).map(([key, item]) => [key, {
        decision: item.decision, evidence: item.quotes.map(quote => `“${quote}”`).join('\n') + `\n资料：${item.source}\n判断：${item.explanation}`,
      }])),
      request: { step: report.id ?? '局部反馈', startedAt: report.startedAt, requestBody: prompt, durationMs: report.elapsedMs,
        usage: { prompt_tokens: sum('input_tokens'), completion_tokens: sum('output_tokens'),
          prompt_tokens_details: { cached_tokens: sum('cached_input_tokens') }, completion_tokens_details: { reasoning_tokens: sum('reasoning_output_tokens') } } },
      archive: { path, report, assessment },
    };
  }));
}
