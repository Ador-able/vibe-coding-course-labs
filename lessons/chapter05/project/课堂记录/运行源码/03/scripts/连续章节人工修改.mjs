import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Store } from '../dist/store.js';

const { values } = parseArgs({ options: { db: { type: 'string', default: 'data/02-连续/novel.sqlite' }, apply: { type: 'boolean', default: false } } });
const db = resolve(values.db);
if (!existsSync(db)) throw new Error('请先运行 node 准备实验.mjs 02-连续，或用 --db 指定已准备的连续章节练习库。');
const first = JSON.parse(readFileSync('materials/第一章真实稿.json', 'utf8'));
const original = '执事没有翻页，先将书平放在案上。远处东侧的封条仍旧贴着，纹丝未动。';
const replacement = '执事没有翻页，先将书平放在案上，拿一枚铜钱压住书角。远处东侧的封条仍旧贴着，纹丝未动。';
const requirement = '后续章节先核对前文已经出现的页码变化，用具体观察推进，不预先给出异常原因。';
const store = new Store(db);
try {
  const { revision, ...work } = store.getWork(first.workId);
  const chapter = store.getChapter(first.workId, 1);
  if (revision !== 1 || chapter?.revision !== 1 || chapter.body !== first.body) throw new Error('连续章节练习起点已变，请先读回；本脚本只处理未修改的历史第一章 r1。');
  if (!chapter.body.endsWith(original)) throw new Error('第一章末句与人工修改提案不一致，停止修改。');
  const body = chapter.body.slice(0, -original.length) + replacement;
  const note = '编者人工操作演示：采用加入铜钱压书角的第一章，供接续实验；不代表用户对小说的文学采用。';
  const proposal = { db, original, replacement, addedRequirement: requirement, note, expected: { workRevision: 2, humanDraftRevision: 2, adoptedRevision: 3 } };
  if (!values.apply) {
    console.log(JSON.stringify({ ...proposal, message: '提案未执行；核对后加 --apply 执行。' }, null, 2));
  } else {
    store.updateWork({ ...work, requirements: [...work.requirements, requirement] }, 1);
    store.saveDraft({ workId: work.id, chapterNumber: 1, expectedWorkRevision: 2, expectedChapterRevision: 1, expectedPreviousRevisions: [], title: chapter.title, body }, 'human');
    const adopted = store.adopt(work.id, 1, 2, note);
    console.log(JSON.stringify({ ...proposal, saved: { workRevision: adopted.workRevision, revision: adopted.revision, status: adopted.status, origin: adopted.origin } }, null, 2));
  }
} finally {
  store.close();
}
