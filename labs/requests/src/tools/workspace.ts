import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { Store } from '../../../../lessons/chapter05/project/src/store.ts';
import { workInput } from '../../../../lessons/chapter05/project/src/schemas.ts';
import type { Draft, ToolSetName } from './contract.ts';

export async function loadInitialWork(project: string) {
  const bytes = await readFile(join(project, 'materials/initial-work.json'));
  return { work: workInput.parse(JSON.parse(bytes.toString('utf8'))), digest: createHash('sha256').update(bytes).digest('hex') };
}

export function readBack(path: string, workId: string): Draft | null {
  const store = new Store(path);
  try {
    const chapter = store.getChapter(workId, 1);
    return chapter ? { number: chapter.number, revision: chapter.revision, workRevision: chapter.workRevision,
      status: 'draft', title: chapter.title, body: chapter.body } : null;
  } finally { store.close(); }
}

// 工具只操作本轮绑定的作品；业务保存沿用事务内的修订检查。
export function writingTools(store: Store, workId: string, toolSet: ToolSetName): ToolSet {
  const chapterInput = z.object({ chapterNumber: z.literal(1).describe('本次教学任务的第一章') });
  const readChapter = () => {
    const chapter = store.getChapter(workId, 1);
    return { workRevision: store.getWork(workId).revision, chapterNumber: 1, chapterRevision: chapter?.revision ?? 0, chapter };
  };
  const shared = {
    read_chapter: tool({ description: '读取第一章的实际正文及当前修订；尚未保存时 chapter 为 null、chapterRevision 为 0。', inputSchema: chapterInput,
      execute: () => readChapter() }),
    save_draft: tool({ description: '保存第一章草稿。使用读取到的作品与正文修订；修订过旧时拒绝保存并要求重新读取。回执只有标识和状态，正文可另行读取。',
      inputSchema: chapterInput.extend({
        expectedWorkRevision: z.number().int().positive(), expectedChapterRevision: z.number().int().nonnegative(),
        title: z.string().trim().min(1), body: z.string().trim().min(1),
      }),
      execute: (input, options) => {
        options.abortSignal?.throwIfAborted();
        const saved = store.saveDraft({ ...input, workId, expectedPreviousRevisions: [] }, 'agent');
        return { chapterNumber: saved.number, revision: saved.revision, workRevision: saved.workRevision, status: saved.status };
      } }),
  };
  if (toolSet === 'combined') return {
    get_writing_context: tool({ description: '一次取得当前章所需的作品要求、原文、设定、大纲、已保存目录和第一章实际正文及修订。',
      inputSchema: chapterInput,
      execute: () => ({ work: store.getWork(workId), chapters: store.listChapters(workId), current: readChapter() }) }),
    ...shared,
  };
  return {
    read_work: tool({ description: '读取当前绑定作品的要求、原文、设定和大纲，以及作品修订。', inputSchema: z.object({}), execute: () => store.getWork(workId) }),
    list_chapters: tool({ description: '查询已保存章节目录和修订，不返回正文；空数组表示还没有保存章节。', inputSchema: z.object({}), execute: () => store.listChapters(workId) }),
    ...shared,
  };
}
