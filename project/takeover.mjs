import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const base = path.dirname(fileURLToPath(import.meta.url));
const runId = process.argv[2];
if (!runId || !/^[a-zA-Z0-9-]+$/.test(runId)) throw new Error('使用 pnpm run takeover <wait 返回的练习编号>');
const runDir = path.join(base, 'runs', runId), materials = path.join(runDir, 'materials');
const report = JSON.parse(await fs.readFile(path.join(runDir, 'wait', 'report.json'), 'utf8'));
if (!report.completed || report.error) throw new Error('待选轮尚未完整结束');
const marker = path.join(runDir, '人工接管记录.json');
try { await fs.access(marker); throw new Error('人工接管已有记录，请保留本次改稿'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const before = await fs.readFile(path.join(materials, 'chapter-one.md'), 'utf8');
const oldParagraph = '屋里重新静下来。林澈的笔尖刚碰到纸，右手边的墙后传来三下轻微的敲击，像指节碰到木板。他停住笔。过了片刻，同一处又轻敲一下。他在本子上写下“三下，停顿，再一下”，还没有判断声音从何而来。';
const newParagraph = oldParagraph + '他又在纸上画出窗户的位置，在右手边墙面旁留了一个空框。那一格不能凭想象填上，他打算下楼，从外面看看。';
if (before.split(oldParagraph).length !== 2) throw new Error('当前第一章不再是本练习的待选起点，请先人工核对');
const replacements = [
  { name: 'chapter-one.md', text: before.replace(oldParagraph, newParagraph) },
  { name: 'current-task.md', text: '# 当前任务：第二章先到楼外调查\n\n编者在本次练习中选择 B 的外部调查方向，A 仅作未采用方案保留。第二章约800至1200个中文字符，紧接实际 chapter-one.md 的结尾。林澈已手画窗户和右手边墙面的空框，打算下楼；第二章从这一步继续，不重新进行室内窗闩检查。\n\n保留：林澈先记录、再判断的谨慎态度；钟停在十一点十七分；周伯有楼门钥匙并已陪同上楼；第三块踏板松动；窗户开着一道缝；三下、停顿、再一下的节奏；准确声源仍未知。\n\n本章新增创作范围：林澈与周伯从楼外辨认窗户和相应墙面，查看钟楼、药铺、空院之间能看见的边界。可以写有依据的观察和人物交谈，但不直接找到准确声源，不把声音判为鬼怪，不凭空打开暗门。\n\n本轮不要检查、固定或维修窗闩，不拆动齿轮，不恢复 A 的室内检查顺序。人的改稿段落已实际保存进 chapter-one.md；先重读，原有 A/B 文件仅保留作为历史方案。交回完整第二章独立草稿，由人阅读和取舍；不自动替换第一章，不声称文学采用、业务保存或发布。\n' },
  { name: 'human-decision.md', text: '# 编者的本次决定与人工改稿\n\n我选择 B 的外部调查方向，拒绝的是 A 先查窗闩的行动顺序，继续完成第二章的目标保留。\n\n我已在实际 chapter-one.md 最后一段后半加入：\n“他又在纸上画出窗户的位置，在右手边墙面旁留了一个空框。那一格不能凭想象填上，他打算下楼，从外面看看。”\n\n这段是本次练习中的人工创作修改，不是第一轮原有事实，也不是用户对正式小说的采用。旧第一章只作历史，当前正文以已保存的 chapter-one.md 为准。第二章承接这张未完成的图，从下楼到楼外辨认位置继续，不再插回检查窗闩的段落。\n\n原有钟停时刻、开锁、松踏板、开缝窗户和敲击节奏仍保留；声音的来由、墙后入口仍未确认。请重新读取当前正文和 current-task.md，再交回完整第二章草稿。还没有第二章业务存档、文学采用或对外发布。\n' },
];
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const changedFiles = [];
for (const item of replacements) {
  let old = null;
  try { old = await fs.readFile(path.join(materials, item.name), 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.writeFile(path.join(materials, item.name), item.text);
  const readBack = await fs.readFile(path.join(materials, item.name), 'utf8');
  if (readBack !== item.text) throw new Error(`写入后读回不同：${item.name}`);
  changedFiles.push({ name: item.name, before: old === null ? null : { bytes: Buffer.byteLength(old), sha256: sha(old), text: old }, after: { bytes: Buffer.byteLength(readBack), sha256: sha(readBack), text: readBack } });
}
await fs.writeFile(marker, JSON.stringify({ runId, threadId: report.threadId, savedAt: new Date().toISOString(), actor: '编者主动执行本命令，实际保存预先明确的课堂人工修改；没有模型调用', oldParagraph, newParagraph, changedFiles, adoptedLiteraryWork: false, businessStoreWritten: false }, null, 2) + '\n');
console.log(JSON.stringify({ runId, materialsPath: materials, changed: changedFiles.map(item => ({ name: item.name, before: item.before?.sha256 ?? null, after: item.after.sha256 })), nextCommand: `pnpm run continue ${runId}` }, null, 2));
