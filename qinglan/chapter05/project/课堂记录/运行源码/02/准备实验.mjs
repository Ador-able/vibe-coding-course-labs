import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Store } from './dist/store.js';
import { workInput } from './dist/schemas.js';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { db: { type: 'string' } } });
const lesson = positionals[0];
if (!['01', '02', '02-连续'].includes(lesson) || positionals.length !== 1) throw new Error('用法：node 准备实验.mjs 01|02|02-连续 [--db data/我的练习.sqlite]');
const db = resolve(values.db ?? `data/${lesson}/novel.sqlite`);
if (existsSync(db)) throw new Error(`练习数据库已存在，不覆盖：${db}。可直接继续，或用 --db 指定新文件。`);
const seed = workInput.parse(JSON.parse(readFileSync('seed/青岚修仙录.json', 'utf8')));
const store = new Store(db);
try {
  store.init(seed);
  if (lesson !== '01') {
    const first = JSON.parse(readFileSync('materials/第一章真实稿.json', 'utf8'));
    // 人工载入历史真实稿，当前库仍有自己的修订和来源。
    store.saveDraft({ workId: seed.id, chapterNumber: 1, expectedWorkRevision: 1, expectedChapterRevision: 0, expectedPreviousRevisions: [], title: first.title, body: first.body }, 'human');
  }
  console.log(JSON.stringify({ lesson, db, work: seed.id, chapters: store.listChapters(seed.id).length, message: lesson === '01' ? '已准备第一章任务。' : '已人工载入历史真实第一章，来源见 materials/第一章来源.json。' }));
} finally {
  store.close();
}
