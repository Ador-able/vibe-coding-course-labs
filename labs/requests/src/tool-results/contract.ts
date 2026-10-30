import type { ToolRun } from '../tools/contract.ts';

export const DEFAULT_TASK = '依据当前作品要求与第一章实际正文，完成第二章《岩壁前的坚持》的完整草稿，保存为待审草稿，并确认实际保存的标题与正文。最后简要说明完成情况，供我审阅。';
export type Predecessor = { title: string; body: string };
export type FeedbackRun = ToolRun & { predecessor: Predecessor };
