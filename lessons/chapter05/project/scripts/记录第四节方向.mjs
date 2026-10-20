import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Store } from '../dist/store.js';

const { values } = parseArgs({ options: { db: { type: 'string', default: 'data/04/novel.sqlite' }, choice: { type: 'string' }, apply: { type: 'boolean', default: false } } });
const directions = JSON.parse(readFileSync('materials/第四节方向.json', 'utf8'));
if (!values.choice || !Object.hasOwn(directions, values.choice)) throw new Error('请用 --choice A 或 --choice B 指定人的选择。');
const db = resolve(values.db);
if (!existsSync(db)) throw new Error('请先准备第四节练习库。');
const store = new Store(db);
try {
  const { revision, ...work } = store.getWork('fanren');
  if (revision !== 1 || store.getChapter(work.id, 1) !== null) throw new Error('当前要求或正文已经变化，请先读回；本入口只记录第一章生成前的方向选择。');
  const decision = `人的方向决定：第一章叙事切入采用“${directions[values.choice]}”这条方向，不采用另一备选；事实和结束范围仍按本轮原文与目标。`;
  const selected = { ...work, requirements: [...work.requirements.filter(item => !item.startsWith('第一章叙事切入尚未由人决定。')), decision] };
  const proposal = { db, choice: values.choice, decision, expectedWorkRevision: revision, resultingWorkRevision: revision + 1 };
  if (values.apply) {
    const saved = store.updateWork(selected, revision);
    console.log(JSON.stringify({ ...proposal, savedRevision: saved.revision }, null, 2));
  } else {
    console.log(JSON.stringify({ ...proposal, message: '提案未执行；核对后加 --apply 写入。' }, null, 2));
  }
} finally {
  store.close();
}
