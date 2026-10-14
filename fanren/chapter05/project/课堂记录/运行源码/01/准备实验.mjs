import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Store } from './dist/store.js';
import { workInput } from './dist/schemas.js';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { db: { type: 'string' } } });
const lesson = positionals[0];
if (lesson !== '01' || positionals.length !== 1) throw new Error('用法：node 准备实验.mjs 01 [--db data/我的练习.sqlite]');
const db = resolve(values.db ?? 'data/01/novel.sqlite');
if (existsSync(db)) throw new Error(`练习数据库已存在，不覆盖：${db}。可直接继续，或用 --db 指定新文件。`);
const seed = workInput.parse(JSON.parse(readFileSync('seed/青岚修仙录.json', 'utf8')));
const store = new Store(db);
try {
  store.init(seed);
  console.log(JSON.stringify({ lesson, db, work: seed.id, chapters: store.listChapters(seed.id).length, message: '已准备第一章任务。' }));
} finally {
  store.close();
}
