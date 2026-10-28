import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tool, type ToolSet } from 'ai';
import { Store } from '../../../../lessons/chapter05/project/src/store.ts';
import { workInput } from '../../../../lessons/chapter05/project/src/schemas.ts';
import type { Draft, ToolSetName } from './contract.ts';
import { writingDefinitions } from './definitions.ts';

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
  const readChapter = () => {
    const chapter = store.getChapter(workId, 1);
    return { workRevision: store.getWork(workId).revision, chapterNumber: 1, chapterRevision: chapter?.revision ?? 0, chapter };
  };
  const shared = {
    read_chapter: tool({ ...writingDefinitions.read_chapter,
      execute: () => readChapter() }),
    save_draft: tool({ ...writingDefinitions.save_draft,
      execute: (input, options) => {
        options.abortSignal?.throwIfAborted();
        const saved = store.saveDraft({ ...input, workId, expectedPreviousRevisions: [] }, 'agent');
        return { chapterNumber: saved.number, revision: saved.revision, workRevision: saved.workRevision, status: saved.status };
      } }),
  };
  if (toolSet === 'combined') return {
    get_writing_context: tool({ ...writingDefinitions.get_writing_context,
      execute: () => ({ work: store.getWork(workId), chapters: store.listChapters(workId), current: readChapter() }) }),
    ...shared,
  };
  return {
    read_work: tool({ ...writingDefinitions.read_work, execute: () => store.getWork(workId) }),
    list_chapters: tool({ ...writingDefinitions.list_chapters, execute: () => store.listChapters(workId) }),
    ...shared,
  };
}
