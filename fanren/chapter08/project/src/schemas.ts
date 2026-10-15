import {z} from 'zod';

export const workId=z.string().trim().regex(/^[a-z0-9-]+$/);
export const chapterNumber=z.number().int().positive();
export const workInput=z.object({
  id:workId,
  title:z.string().trim().min(1),
  purpose:z.string().trim().min(1),
  requirements:z.array(z.string().trim().min(1)).min(1),
  facts:z.array(z.string().trim().min(1)).min(1),
  outline:z.array(z.object({number:chapterNumber,titleHint:z.string().min(1),goal:z.string().min(1)})).min(1),
});
export const draftInput=z.object({
  workId,
  chapterNumber,
  expectedWorkRevision:z.number().int().positive(),
  expectedChapterRevision:z.number().int().nonnegative(),
  expectedPreviousRevisions:z.array(z.object({number:chapterNumber,revision:z.number().int().positive()})),
  title:z.string().trim().min(1),
  // 正文保留原有缩进，只拒绝空白内容。
  body:z.string().regex(/\S/u,'正文不能为空'),
});
export const workOutput=workInput.extend({revision:z.number().int().positive()});
export const chapterOutput=z.object({
  workId,
  number:chapterNumber,
  revision:z.number().int().positive(),
  title:z.string(),
  body:z.string(),
  status:z.enum(['draft','adopted']),
  workRevision:z.number().int().positive(),
  origin:z.enum(['human','agent']),
  taskId:z.string().nullable(),
  threadId:z.string().nullable(),
  updatedAt:z.string(),
  previousRevisions:z.array(z.object({number:chapterNumber,revision:z.number().int().positive()})).optional(),
  reviewNote:z.string().nullable().optional(),
});
export type WorkInput=z.infer<typeof workInput>;
export type DraftInput=z.infer<typeof draftInput>;

export class LabError extends Error {
  constructor(public readonly code:string,message:string){super(message);this.name='LabError';}
}
