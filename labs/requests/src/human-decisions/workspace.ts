import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { tool } from 'ai';
import { z } from 'zod';
import { Store } from '../../../../lessons/chapter05/project/src/store.ts';
import { draftInput, LabError } from '../../../../lessons/chapter05/project/src/schemas.ts';
import type { ToolDefinition } from '../tools/contract.ts';
import type { HumanRun, Materials } from './contract.ts';

export const PENDING_DIRECTION = '开篇叙事方式由作者决定。先依据已读资料拟定两种不同的开场方案，简述各自特点并请作者选择；选择前不代选，不生成或保存正文。';
export const questionSchema = z.object({ question: z.string().trim().min(1), options: z.array(z.object({ id: z.enum(['A', 'B']), label: z.string().trim().min(1) })).length(2) });
export const saveSchema = draftInput.extend({ chapterNumber: z.literal(1) });
const definitions = {
  read_work: { description: '读取当前作品要求、原文依据及最新修订。', inputSchema: z.object({}) },
  read_chapter: { description: '读取当前第一章的实际正文、采用状态与修订；尚无正文时返回空结果。', inputSchema: z.object({}) },
  ask_direction: { description: '依据已读资料提出两种不同的开场方案，分别用A、B标识，并在每个选项中说明方案及叙事特点，请作者选择。应用展示实际问题与选项，收到回答后继续原任务。', inputSchema: questionSchema },
  save_draft: { description: '依据实际读取的修订保存本轮作品的第一章草稿，不代表内容已被采用。批准操作环节还需要对应本次具体参数的人工许可。', inputSchema: saveSchema },
};
export const toolDefinitions = (): ToolDefinition[] => Object.entries(definitions).map(([name, value]) => ({ name, description: value.description, parameters: z.toJSONSchema(value.inputSchema, { target: 'draft-7' }) }));
export async function loadMaterials(project: string): Promise<Materials> { return JSON.parse(await readFile(join(project, 'materials.json'), 'utf8')); }
export function snapshot(database: string, workId: string) {
  const store = new Store(database);
  try { return { work: store.getWork(workId), readBack: store.getChapter(workId, 1) }; } finally { store.close(); }
}

// 审批只允许当前请求的原始参数进入真正保存；采用由人工入口另行处理。
export function humanTools(store: Store, run: HumanRun) {
  return {
    read_work: tool({ ...definitions.read_work, execute: () => store.getWork(run.work.id) }),
    read_chapter: tool({ ...definitions.read_chapter, execute: () => ({ chapter: store.getChapter(run.work.id, 1), chapterNumber: 1 }) }),
    ask_direction: tool(definitions.ask_direction),
    save_draft: tool({ ...definitions.save_draft, execute: (input, options) => {
      options.abortSignal?.throwIfAborted();
      if (input.workId !== run.work.id) throw new LabError('WORK_MISMATCH', '保存对象不属于本轮作品。');
      if (run.phase === 'direction' && !run.choice) throw new LabError('DIRECTION_REQUIRED', '叙事切入仍待人选择，不能保存代表已选方向的正文。');
      if (run.phase === 'approval') {
        if (!run.pending || !run.decision?.approved || run.decision.approvalId !== run.pending.approvalId || options.toolCallId !== run.pending.toolCallId || !isDeepStrictEqual(input, run.pending.input)) {
          throw new LabError('ACTION_NOT_APPROVED', '实际动作没有与当前对象及参数对应的批准。');
        }
      }
      const saved = store.saveDraft(input, 'agent');
      run.events.push({ kind: 'actual-save', at: new Date().toISOString(), value: { approvalId: run.pending?.approvalId ?? null, toolCallId: options.toolCallId, input, saved } });
      return { chapterNumber: saved.number, revision: saved.revision, status: saved.status };
    } }),
  };
}
