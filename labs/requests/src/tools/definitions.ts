import { z } from 'zod';
import type { ToolDefinition, ToolSetName } from './contract.ts';

const chapterInput = z.object({ chapterNumber: z.literal(1).describe('本次教学任务的第一章') });

// 页面展示和实际调用共用定义，避免名称、说明或参数结构发生偏差。
export const writingDefinitions = {
  read_work: { description: '读取当前绑定作品的要求、原文、设定和大纲，以及作品修订。', inputSchema: z.object({}) },
  list_chapters: { description: '查询已保存章节目录和修订，不返回正文；空数组表示还没有保存章节。', inputSchema: z.object({}) },
  read_chapter: { description: '读取第一章的实际正文及当前修订；尚未保存时 chapter 为 null、chapterRevision 为 0。', inputSchema: chapterInput },
  save_draft: {
    description: '保存第一章草稿。使用读取到的作品与正文修订；修订过旧时拒绝保存并要求重新读取。回执只有标识和状态，正文可另行读取。',
    inputSchema: chapterInput.extend({
      expectedWorkRevision: z.number().int().positive(), expectedChapterRevision: z.number().int().nonnegative(),
      title: z.string().trim().min(1), body: z.string().trim().min(1),
    }),
  },
  get_writing_context: { description: '一次取得当前章所需的作品要求、原文、设定、大纲、已保存目录和第一章实际正文及修订。', inputSchema: chapterInput },
};

export function toolDefinitions(toolSet: ToolSetName): ToolDefinition[] {
  const names: (keyof typeof writingDefinitions)[] = toolSet === 'combined'
    ? ['get_writing_context', 'read_chapter', 'save_draft']
    : ['read_work', 'list_chapters', 'read_chapter', 'save_draft'];
  return names.map(name => ({ name, description: writingDefinitions[name].description,
    parameters: z.toJSONSchema(writingDefinitions[name].inputSchema, { target: 'draft-7' }) }));
}
