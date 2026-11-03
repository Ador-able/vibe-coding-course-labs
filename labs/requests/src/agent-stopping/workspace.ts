import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tool } from 'ai';
import { z } from 'zod';
import { Store } from '../../../../lessons/chapter05/project/src/store.ts';
import { draftInput, LabError } from '../../../../lessons/chapter05/project/src/schemas.ts';
import { PENDING_DIRECTION, questionSchema } from '../human-decisions/workspace.ts';
import type { ToolDefinition } from '../tools/contract.ts';
import type { Materials, Run, Scenario } from './contract.ts';

export const WRITE_FAILURE = '课堂受控写入故障：本轮章节写入持续不可用，需由运行环境修复；修改正文或重复请求不会解除。';
const definitions = {
  read_work: { description: '读取当前作品的要求、原文、设定及第一章大纲，包含实际修订。', inputSchema: z.object({}) },
  read_chapter: { description: '读取当前第一章的实际标题、正文和修订；尚未保存时 chapter 为 null。', inputSchema: z.object({}) },
  save_draft: { description: '按实际读取的要求与正文修订保存第一章完整草稿。写入失败会返回真实错误；成功后仍需读取确认，不代表作者采用。', inputSchema: draftInput.extend({ chapterNumber: z.literal(1) }) },
  ask_direction: { description: '依据已读资料提出两种不同开场，在各选项中说明特点，请作者选择。A、B是选项标识。应用保留问题和任务，等待作者决定。', inputSchema: questionSchema },
};
export const toolDefinitions = (): ToolDefinition[] => Object.entries(definitions).map(([name, item]) => ({ name, description: item.description, parameters: z.toJSONSchema(item.inputSchema, { target: 'draft-7' }) }));
export const loadMaterials = async (project: string): Promise<Materials> => JSON.parse(await readFile(join(project, 'materials.json'), 'utf8'));
export function prepare(database: string, materials: Materials, scenario: Scenario) {
  const store = new Store(database);
  try {
    const work = store.init({ ...materials.work, requirements: [...materials.work.requirements, ...(scenario === 'B' ? [PENDING_DIRECTION] : [])] });
    const initialChapter = scenario === 'cancel' ? store.saveDraft({ workId: work.id, chapterNumber: 1, expectedWorkRevision: work.revision, expectedChapterRevision: 0, expectedPreviousRevisions: [], ...materials.initialChapter }, 'human') : null;
    // 只在 C 的独立工作区制造真实数据库写入失败，读取和运行记录不受影响。
    if (scenario === 'C') store.db.exec(`CREATE TRIGGER classroom_save_failure BEFORE INSERT ON chapters BEGIN SELECT RAISE(ABORT,'${WRITE_FAILURE}'); END;`);
    return { work, initialChapter };
  } finally { store.close(); }
}
export function readBack(database: string, workId: string) {
  const store = new Store(database); try { return store.getChapter(workId, 1); } finally { store.close(); }
}
export function writingTools(store: Store, run: Run) {
  return {
    read_work: tool({ ...definitions.read_work, execute: () => store.getWork(run.work.id) }),
    read_chapter: tool({ ...definitions.read_chapter, execute: () => ({ chapter: store.getChapter(run.work.id, 1) }) }),
    ask_direction: tool(definitions.ask_direction),
    save_draft: tool({ ...definitions.save_draft, execute: (input, options) => {
      options.abortSignal?.throwIfAborted();
      if (input.workId !== run.work.id) throw new LabError('WORK_MISMATCH', '保存对象不属于本轮工作区。');
      if (run.scenario === 'B' && !run.answer) throw new LabError('AUTHOR_DECISION_REQUIRED', '开篇叙事方式仍待作者决定，当前不能保存代表已确定方向的正文。');
      const saved = store.saveDraft(input, 'agent');
      run.events.push({ type: 'saved', at: new Date().toISOString(), value: { toolCallId: options.toolCallId, saved } });
      return { chapterNumber: saved.number, revision: saved.revision, status: saved.status };
    } }),
  };
}
