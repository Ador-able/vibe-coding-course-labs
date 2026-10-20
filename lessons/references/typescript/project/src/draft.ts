import { readFile } from 'node:fs/promises';
import { z } from 'zod';

export const DraftSchema = z.strictObject({
  chapter: z.number().int().positive(),
  title: z.string().min(1),
  text: z.string().min(1),
  status: z.enum(['draft', 'review']),
  notes: z.array(z.string()).optional(),
});
export type Draft = z.infer<typeof DraftSchema>;

export async function readDraft(file: string | URL): Promise<Draft> {
  const raw: unknown = JSON.parse(await readFile(file, 'utf8'));
  // 外部文件在进入时解析，内部函数接收已经成立的类型。
  return DraftSchema.parse(raw);
}
