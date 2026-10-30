import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { tool } from 'ai';
import type { ToolDefinition } from '../tools/contract.ts';
import type { Materials, Variant } from './contract.ts';

const definitions = {
  read_work: { description: '读取当前作品的写作要求。', inputSchema: z.object({}) },
  read_chapter: { description: '读取当前待核对的第一章完整练习稿。', inputSchema: z.object({}) },
  search_settings: { description: '按章稿中的词语查询设定目录，可用空格分开多个词。只返回资料标识、标题与用途简介；核对原文请使用 read_setting。', inputSchema: z.object({ query: z.string().trim().min(1).describe('从当前问题中选取的查询词语') }) },
  read_setting: { description: '根据查询得到的资料标识读取完整设定原文。', inputSchema: z.object({ id: z.string().trim().min(1).describe('设定资料标识') }) },
};
export const toolDefinitions = (): ToolDefinition[] => Object.entries(definitions).map(([name, value]) => ({ name, description: value.description, parameters: z.toJSONSchema(value.inputSchema, { target: 'draft-7' }) }));
export async function loadMaterials(project: string): Promise<Materials> { return JSON.parse(await readFile(join(project, 'materials.json'), 'utf8')); }

// 资料快照只读；核对依据单独留给学生，不进入模型工具返回。
export function materialTools(materials: Materials, variant: Variant) {
  return {
    read_work: tool({ ...definitions.read_work, execute: () => materials.work }),
    read_chapter: tool({ ...definitions.read_chapter, execute: () => materials.chapters[variant] }),
    search_settings: tool({ ...definitions.search_settings, execute: ({ query }) => {
      const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
      const matches = materials.documents.filter(document => words.some(word => `${document.title} ${document.description} ${document.body}`.toLocaleLowerCase().includes(word)));
      return { query, matches: matches.map(({ id, title, description }) => ({ id, title, description })), ...(matches.length ? {} : { note: '没有匹配资料。可改用章稿中的简短词语查询。' }) };
    } }),
    read_setting: tool({ ...definitions.read_setting, execute: ({ id }) => {
      const document = materials.documents.find(item => item.id === id);
      return document ?? { error: 'SETTING_NOT_FOUND', message: '没有找到这份设定，请依据查询结果中的标识读取。' };
    } }),
  };
}
