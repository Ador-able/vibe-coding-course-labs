import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Lesson, TaskRun } from './contract.ts';

const files: Record<Lesson, string> = {
  goals: '任务验收', examples: '样例对照', feedback: '局部反馈', evaluation: '评估样本', cost: '成本比较',
};

// 每节保留一份完整实录；加载时不生成本机运行，也不重新判断历史结果。
export async function loadClassroom(project: string, lesson: Lesson): Promise<TaskRun[]> {
  return JSON.parse(await readFile(join(project, '课堂记录', `${files[lesson]}.json`), 'utf8')) as TaskRun[];
}
