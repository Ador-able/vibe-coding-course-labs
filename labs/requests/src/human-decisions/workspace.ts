import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { tool } from 'ai';
import { z } from 'zod';
import { Store } from '../../../../lessons/chapter05/project/src/store.ts';
import { draftInput, LabError } from '../../../../lessons/chapter05/project/src/schemas.ts';
import type { ToolDefinition } from '../tools/contract.ts';
import type { HumanRun, Materials } from './contract.ts';

export const PENDING_DIRECTION = '叙事切入尚未决定：A 从来到竹林开始，再交代离家目的与规则；B 从竹林喘息开始，再回到规则与目的。先向人提出这两个选项，选择前不代选，不生成或保存正文。';
export const questionSchema = z.object({ question: z.string().trim().min(1), options: z.array(z.object({ id: z.enum(['A', 'B']), label: z.string().trim().min(1) })).length(2) });
export const saveSchema = draftInput.extend({ chapterNumber: z.literal(1) });
const definitions = {
  read_work: { description: '读取当前作品要求、原文依据及最新修订。', inputSchema: z.object({}) },
  read_chapter: { description: '读取当前第一章的实际正文、采用状态与修订；尚无正文时返回空结果。', inputSchema: z.object({}) },
  ask_direction: { description: '向人提出叙事切入问题与A、B两个选项。应用展示问题并等待回答，收到回答后继续原任务。', inputSchema: questionSchema },
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
