import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Store } from './dist/store.js';
import { workInput } from './dist/schemas.js';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { db: { type: 'string' } } });
const lesson = positionals[0];
if (!['01', '02', '02-连续', '04', '04-审批'].includes(lesson) || positionals.length !== 1) throw new Error('用法：node 准备实验.mjs 01|02|02-连续|04|04-审批 [--db data/我的练习.sqlite]');
const db = resolve(values.db ?? `data/${lesson}/novel.sqlite`);
if (existsSync(db)) throw new Error(`练习数据库已存在，不覆盖：${db}。可直接继续，或用 --db 指定新文件。`);
let seed = workInput.parse(JSON.parse(readFileSync('seed/青岚修仙录.json', 'utf8')));
if (lesson === '04') {
  const directions = JSON.parse(readFileSync('materials/第四节方向.json', 'utf8'));
  seed = { ...seed, requirements: [...seed.requirements, `第一章章末方向尚未由人决定。备选 A：${directions.A}备选 B：${directions.B}先提出这个具体问题，等待人的选择；未确定前不代选、不合并两案，也不生成或保存代表已确定方向的正文。`] };
}
if (lesson === '04-审批') {
  seed = { ...seed, purpose: '用短教学草稿观察具体保存动作的人工审批。', requirements: ['只保存人明确批准的完整参数和正文，不采用、不发布、不对外发送。'], outline: [{ number: 1, titleHint: '待确认的草稿', goal: '保存人实际批准的短教学正文，保留草稿状态。' }] };
}
const store = new Store(db);
try {
  store.init(seed);
  if (lesson === '02' || lesson === '02-连续') {
    const first = JSON.parse(readFileSync('materials/第一章真实稿.json', 'utf8'));
    // 人工载入历史真实稿，当前库仍有自己的修订和来源。
    store.saveDraft({ workId: seed.id, chapterNumber: 1, expectedWorkRevision: 1, expectedChapterRevision: 0, expectedPreviousRevisions: [], title: first.title, body: first.body }, 'human');
  }
  console.log(JSON.stringify({ lesson, db, work: seed.id, chapters: store.listChapters(seed.id).length, message: lesson === '02' || lesson === '02-连续' ? '已人工载入历史真实第一章，来源见 materials/第一章来源.json。' : '已准备独立练习库。' }));
} finally {
  store.close();
}
