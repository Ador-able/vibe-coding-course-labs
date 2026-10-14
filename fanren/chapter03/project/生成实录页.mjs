import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';

const [baseId, tieredId = baseId] = process.argv.slice(2);
if (!baseId) throw new Error('请传入运行记录文件夹名；逐层读取另行运行时，再传入它的文件夹名。');
const readReport = async id => JSON.parse(await readFile(path.join('运行记录', id, 'report.json'), 'utf8'));
const base = await readReport(baseId);
const tiered = await readReport(tieredId);
assert.deepEqual(base.inputFiles, tiered.inputFiles, '比较的资料必须完全相同');
for (const report of [base, tiered]) assert.deepEqual(report.inputFiles, report.afterFiles, '运行期间材料发生变化');
const take = (report, condition) => {
  const result = report.conditions.find(item => item.condition === condition);
  assert.equal(result?.state, 'completed', `${condition} 没有完成`);
  return result;
};
const compressed = take(base, 'compress');
const full = take(base, 'full');
const summary = take(base, 'summary');
const selected = take(tiered, 'tiered');
const summaryText = await readFile(path.join('运行记录', baseId, 'compress/output.txt'), 'utf8');
assert.equal(createHash('sha256').update(summaryText).digest('hex'), base.summarySource.sha256);
const summaryPrompt = await readFile(path.join('运行记录', baseId, 'summary/prompt.txt'), 'utf8');
assert.ok(summaryPrompt.includes(compressed.finalResponse), '回答没有使用本轮摘要');

const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const relative = value => value.replaceAll('\\\\', '/').replaceAll('\\', '/').split('/材料包/')[1];
const calls = selected.reads ?? [];
assert.ok(calls.length > 0, '逐层组没有取得文件');
const trace = [];
for (const call of calls) {
  assert.equal(call.status, 'completed');
  assert.equal(call.error, null);
  const file = relative(call.arguments.path);
  const expected = await readFile(path.join('材料包', file), 'utf8');
  assert.equal(call.result.content[0].text, expected, `${file} 返回与原文不符`);
  trace.push({ file, characters: expected.length, tool: call.tool });
}
const excerpt = result => [...result.finalResponse.matchAll(/^\d\.\s+\*\*([^*]+)\*\*/gm)].map(match => match[1]);
const rows = [
  ['全文提供', '30 条原文与入口、规则、目录', full, baseId, 'full'],
  ['本轮摘要', '现场生成的阅读进度摘要', summary, baseId, 'summary'],
  ['逐层读取', '先入口，再读相关原文', selected, tieredId, 'tiered'],
];
const rawDetails = rows.map(([name, , result, id, condition]) => `<details><summary>${name}：实际输入与完整回答</summary><div class="details-body"><p><a href="运行记录/${id}/${condition}/prompt.txt">本次输入原文</a> · <a href="运行记录/${id}/${condition}/events.jsonl">实际事件记录</a></p><pre>${escape(result.finalResponse)}</pre></div></details>`).join('');
const source = { baseRun: baseId, tieredRun: tieredId, sourceRevisions: [base.executionGitHead, tiered.executionGitHead], summarySha256: base.summarySource.sha256, inputFilesUnchanged: true, trace };
await writeFile('课堂实录.json', `${JSON.stringify(source, null, 2)}\n`);
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>渐进式读取 · 课堂实录</title><style>
:root{color-scheme:light;--blue:#315f91;--line:#d7e1ec}*{box-sizing:border-box}body{margin:0;background:#f7f8fa;color:#20364d;font:17px/1.7 "Microsoft YaHei",sans-serif}main{max-width:1120px;margin:0 auto;padding:32px 28px 56px}h1{font-size:29px;margin:0 0 6px;color:#173c61}h2{font-size:23px;margin:28px 0 12px}p{margin:9px 0}.meta{color:#60788f;font-size:15px}.questions{border-left:4px solid var(--blue);padding:8px 18px;margin:20px 0;background:white}table{width:100%;border-collapse:collapse;background:white}th,td{border-bottom:1px solid var(--line);padding:15px 18px;text-align:left;vertical-align:top}th{color:var(--blue);background:#edf2f8}th:first-child{width:16%}th:nth-child(2){width:29%}td p{margin:3px 0}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}section{border-top:1px solid var(--line)}.summary{padding:20px 24px;background:white;border:1px solid var(--line);border-radius:8px}details{background:white;border:1px solid var(--line);border-radius:8px;margin:12px 0}summary{cursor:pointer;color:var(--blue);padding:14px 20px}.details-body{padding:18px 22px;border-top:1px solid var(--line)}a{color:var(--blue)}.trace td:first-child{width:10%}.trace td:nth-child(2){width:55%}.note{color:#60788f;font-size:15px}.question-label{color:#60788f;font-size:14px;margin-right:8px}@media(max-width:680px){main{padding:20px 16px}th,td{padding:10px 8px}body{font-size:15px}}
</style><main><section id="compare"><h1>三种读法，能回答同样的两题吗？</h1><p class="meta">《凡人修仙传》30 条原文 · 课堂实录 · ${escape(base.startedAt.slice(0, 10))}</p><div class="questions"><p>① 韩立大哥做铁匠学徒，每月拿多少铜板？</p><p>② 三叔在青牛镇临走前，怎样交代韩立的活动范围？</p></div><table><thead><tr><th>读法</th><th>本轮取得什么</th><th>实际回答首句（从返回中提取）</th></tr></thead><tbody>${rows.map(([name, input, result]) => { const answers = excerpt(result); assert.equal(answers.length, 2); return `<tr><td><strong>${name}</strong></td><td>${input}</td><td>${answers.map((answer, i) => `<p><span class="question-label">${i + 1}</span>${escape(answer)}</p>`).join('')}</td></tr>`; }).join('')}</tbody></table><p class="note">摘要由本轮原文现场生成，再交给新会话回答。逐层读取初次遇到工具启动故障，修复读取工具后仅重跑该组；两次资料哈希相同。</p></section><section id="summary"><h2>现场生成的摘要，保留了哪些内容？</h2><div class="summary"><pre>${escape(compressed.finalResponse)}</pre></div><p class="note">上面为 compress/output.txt 的实际内容；摘要组没有原文读取工具。完整输入、返回和工具记录可在下方展开。</p></section><section id="reads"><h2>逐层读取：实际取得的 5 份文件</h2><table class="trace"><thead><tr><th>顺序</th><th>读取文件</th><th>实际返回</th></tr></thead><tbody>${trace.map((item, i) => `<tr><td>${i + 1}</td><td>${escape(item.file)}</td><td>全文 · ${item.characters.toLocaleString('zh-CN')} 字符</td></tr>`).join('')}</tbody></table><p>规则和目录用于定位；两处细节的依据来自 C01、C02 原文。C03—C30 本轮没有展开。</p></section><section><h2>回查本轮记录</h2>${rawDetails}<details><summary>摘要生成的实际输入与返回</summary><div class="details-body"><a href="运行记录/${baseId}/compress/prompt.txt">本次压缩输入</a><pre>${escape(compressed.finalResponse)}</pre></div></details><details><summary>首次读取失败及运行版本</summary><div class="details-body"><pre>${escape(JSON.stringify(source, null, 2))}</pre><p>首次逐层读取未取得文件。原始错误和答复保留在 <a href="运行记录/${baseId}/tiered/events.jsonl">首次事件记录</a>，没有计作读取成功。</p></div></details></section></main></html>`;
await writeFile('课堂实录.html', html);
console.log(JSON.stringify({ page: '课堂实录.html', ...source }));
