import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CaseId, Criterion, RunInput, TaskRun } from './contract.ts';

export async function loadMaterials(project: string) {
  const read = (path: string) => readFile(join(project, path), 'utf8');
  const [S1, S2, S3, conflict, consistent, feedback, original, preflight, review] = await Promise.all([
    ...['S1', 'S2', 'S3'].map(id => read(`材料/任务-${id}.txt`)),
    read('材料/样例-冲突.txt'), read('材料/样例-相容.txt'), read('feedback/反馈要求.txt'),
    read('feedback/输入/原稿.txt'), read('evaluation/通用核对要求.txt'), read('材料/通用审稿要求.txt'),
  ]);
  return { tasks: { S1, S2, S3 }, conflict, consistent, feedback, original, preflight, review };
}
export type Materials = Awaited<ReturnType<typeof loadMaterials>>;

// 每节只改变要观察的那一项；完整任务沿用同一份资料。
export function buildPrompt(input: RunInput, materials: Materials, parent?: TaskRun) {
  const task = materials.tasks[input.caseId];
  if (input.lesson === 'feedback') return `${materials.feedback}\n\n<写作任务>\n${task}\n</写作任务>\n\n<原稿>\n${materials.original}\n</原稿>`;
  if (input.lesson === 'cost' && input.method === 'B') return `${materials.review}\n\n<写作任务>\n${task}\n</写作任务>\n\n<初稿>\n${parent!.output}\n</初稿>`;
  if (input.lesson === 'examples' && input.method !== 'none') return `${task}\n\n<写法样例>\n${materials[input.method as 'conflict' | 'consistent']}\n</写法样例>`;
  if (input.lesson === 'evaluation' && input.method === 'B') return `${task}\n\n${materials.preflight}`;
  return task;
}

export function criteria(caseId: CaseId): Criterion[] {
  const specific: Record<CaseId, string[]> = {
    S1: ['十岁、家境贫困、三叔举荐；未习武，尚未成为正式弟子。', '岳堂主宣布正午截止，路线为竹林、岩壁、山崖；师兄在后保护。', '写清来意与体力、时间阻碍，结束在竹林中继续前行。'],
    S2: ['韩立受伤后攀岩，舞岩在前，师兄在后保护；不提前获得功法或正式录取。', '保留正午截止，结束在抓住麻绳，不提前宣布韩立考核结果。', '通过行动写出追赶、疼痛与坚持，不以设定清单替代故事。'],
    S3: ['未按时登顶，暂留半年复考；舞岩去七绝堂，不写成韩立已正式录取。', '墨大夫带韩立、张铁入神手谷，先教采药、炼药及可能的医术，不教武功。', '写清去向与学习安排，停在晚间交代，不展开以后的修炼结果。'],
  };
  return [...specific[caseId].map((text, i) => ({ id: `fact-${i + 1}`, text })),
    { id: 'delivery', text: '交出标题和完整正文；没有夹带大纲、解释、自评或后续章节。' }];
}
