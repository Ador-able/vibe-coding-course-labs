import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { tool } from 'ai';
import { Store } from '../../../../lessons/chapter05/project/src/store.ts';
import { workInput } from '../../../../lessons/chapter05/project/src/schemas.ts';
import type { Draft, ToolDefinition } from '../tools/contract.ts';
import { writingDefinitions } from '../tools/definitions.ts';
import type { Predecessor } from './contract.ts';

const chapter = z.object({ chapterNumber: z.union([z.literal(1), z.literal(2)]).describe('读取第一章前文或第二章当前草稿') });
const definitions = {
  read_work: { ...writingDefinitions.read_work, description: '读取本轮作品要求、设定、大纲和作品修订。' },
  list_chapters: writingDefinitions.list_chapters,
  read_chapter: { description: '读取指定章节的当前正文及修订；章节尚未保存时 chapter 为 null、chapterRevision 为 0。', inputSchema: chapter },
  save_draft: { description: '保存第二章草稿，使用读取到的作品、目标章与第一章修订。依据过旧时拒绝保存并提示重新读取。回执返回标识与状态，正文可另行读取。',
    inputSchema: z.object({ chapterNumber: z.literal(2), expectedWorkRevision: z.number().int().positive(), expectedChapterRevision: z.number().int().nonnegative(),
      expectedPreviousRevisions: z.array(z.object({ number: z.literal(1), revision: z.number().int().positive() })).length(1),
      title: z.string().trim().min(1), body: z.string().trim().min(1) }) },
};
export const toolDefinitions = (): ToolDefinition[] => Object.entries(definitions).map(([name, value]) => ({ name, description: value.description,
  parameters: z.toJSONSchema(value.inputSchema, { target: 'draft-7' }) }));

export async function loadMaterials(project: string) {
  const [workBytes, predecessorBytes] = await Promise.all([readFile(join(project, 'materials/work.json')), readFile(join(project, 'materials/predecessor.json'))]);
  return { work: workInput.parse(JSON.parse(workBytes.toString('utf8'))),
    chapters: JSON.parse(predecessorBytes.toString('utf8')) as { original: Predecessor; current: Predecessor } };
}

// 每次运行建立独立工作区，前文编辑通过真实保存进入读取结果。
export async function prepareWorkspace(project: string, database: string, predecessor: Predecessor) {
  const { work, chapters } = await loadMaterials(project), store = new Store(database);
  try {
    store.init(work);
    const basis = { workId: work.id, chapterNumber: 1, expectedWorkRevision: 1, expectedPreviousRevisions: [] };
    store.saveDraft({ ...basis, expectedChapterRevision: 0, ...chapters.original }, 'human');
    if (predecessor.title !== chapters.original.title || predecessor.body !== chapters.original.body)
      store.saveDraft({ ...basis, expectedChapterRevision: 1, ...predecessor }, 'human');
  } finally { store.close(); }
  return { workId: work.id, seedDigest: createHash('sha256').update(JSON.stringify({ work, predecessor })).digest('hex') };
}

export function feedbackTools(store: Store, workId: string) {
  return {
    read_work: tool({ ...definitions.read_work, execute: () => store.getWork(workId) }),
    list_chapters: tool({ ...definitions.list_chapters, execute: () => store.listChapters(workId) }),
    read_chapter: tool({ ...definitions.read_chapter, execute: ({ chapterNumber }) => {
      const current = store.getChapter(workId, chapterNumber);
      return { chapterNumber, workRevision: store.getWork(workId).revision, chapterRevision: current?.revision ?? 0, chapter: current };
    } }),
    save_draft: tool({ ...definitions.save_draft, execute: (input, options) => {
      options.abortSignal?.throwIfAborted();
      const saved = store.saveDraft({ ...input, workId }, 'agent');
      return { chapterNumber: saved.number, revision: saved.revision, workRevision: saved.workRevision, status: saved.status };
    } }),
  };
}

export function readBack(database: string, workId: string): Draft | null {
  const store = new Store(database);
  try {
    const chapter = store.getChapter(workId, 2);
    return chapter ? { number: chapter.number, revision: chapter.revision, workRevision: chapter.workRevision, status: 'draft', title: chapter.title, body: chapter.body } : null;
  } finally { store.close(); }
}
