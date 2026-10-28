import '../lab.css';
import '../../../../shared/markdown.css';
import './style.css';
import { renderMarkdown } from '../../../../shared/markdown.ts';
import { TOOL_SETS, type ToolsRun, type ToolSetName } from './contract.ts';

const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = `<header><h1>工具读写实验</h1><p>让模型选择读取和保存的业务工具，再核对实际留下的草稿。</p></header>
  <label for="task">任务</label><textarea id="task" rows="4" maxlength="12000"></textarea>
  <div class="tools-controls"><label for="tool-set">工具集 <select id="tool-set"><option value="separate">分散读取</option><option value="combined">组合读取</option></select></label>
  <button id="run" disabled>运行任务</button><button id="stop" class="secondary" hidden>停止</button><button id="classroom" class="secondary" disabled>加载课堂实录</button></div>
  <p id="status" role="status" aria-live="polite"></p>
  <details><summary>任务依据与工具</summary><div id="materials" class="guide-body"></div></details>
  <section id="results" hidden><div class="tools-result-bar"><span id="source"></span><div id="conditions" role="tablist" aria-label="比较工具集"></div></div><div id="result"></div></section>`;
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const task = get<HTMLTextAreaElement>('task'), selection = get<HTMLSelectElement>('tool-set');
const start = get<HTMLButtonElement>('run'), stop = get<HTMLButtonElement>('stop'), classroom = get<HTMLButtonElement>('classroom');
const status = (text: string) => { get('status').textContent = text; };
let records = new Map<ToolSetName, ToolsRun>(), selected: ToolSetName = 'separate', source = '本机运行', currentId: string | undefined;
const number = (value: number | null) => value === null ? '未知' : value.toLocaleString('zh-CN');
async function json<T>(path: string, init?: RequestInit) {
  const response = await fetch('/api/tools/' + path, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '本机请求未完成，请检查服务。');
  return data as T;
}
function markdown(parent: HTMLElement, heading: string, text: string) {
  const title = document.createElement('h3'), body = document.createElement('div'); title.textContent = heading;
  renderMarkdown(body, text); parent.append(title, body);
}
function technical(parent: HTMLElement, heading: string, value: unknown) {
  const title = document.createElement('p'), pre = document.createElement('pre'); title.textContent = heading;
  pre.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2); parent.append(title, pre);
}
type Work = { title: string; purpose: string; revision: number; requirements: string[]; facts: string[]; outline: { number: number; titleHint: string; goal: string }[] };
type Current = { workRevision: number; chapterRevision: number; chapter: { title: string; body: string } | null };
function readableWork(parent: HTMLElement, work: Work) {
  markdown(parent, `作品要求 · r${work.revision}`, `## ${work.title}\n\n${work.purpose}\n\n${work.requirements.map(item => '- ' + item).join('\n')}\n\n${work.facts.join('\n\n')}\n\n## 当前章大纲\n\n${work.outline.map(item => `### 第 ${item.number} 章 ${item.titleHint}\n\n${item.goal}`).join('\n\n')}`);
}
function readableChapter(parent: HTMLElement, current: Current) {
  markdown(parent, `实际正文 · r${current.chapterRevision}`, current.chapter ? `### ${current.chapter.title}\n\n${current.chapter.body}` : '第一章尚未保存草稿。');
}
function readableResult(parent: HTMLElement, name: string, value: unknown) {
  if (name === 'read_work') readableWork(parent, value as Work);
  else if (name === 'read_chapter') readableChapter(parent, value as Current);
  else if (name === 'get_writing_context') {
    const context = value as { work: Work; chapters: { number: number; title: string; revision: number }[]; current: Current };
    readableWork(parent, context.work);
    markdown(parent, '已保存目录', context.chapters.length ? context.chapters.map(item => `- 第 ${item.number} 章 ${item.title} · r${item.revision}`).join('\n') : '当前没有已保存章节。');
    readableChapter(parent, context.current);
  } else if (name === 'list_chapters') {
    const chapters = value as { number: number; title: string; revision: number }[];
    markdown(parent, '已保存目录', chapters.length ? chapters.map(item => `- 第 ${item.number} 章 ${item.title} · r${item.revision}`).join('\n') : '当前没有已保存章节。');
  } else if (name === 'save_draft') {
    const receipt = value as { chapterNumber: number; revision: number; status: string };
    const saved = document.createElement('p'); saved.textContent = `第 ${receipt.chapterNumber} 章 · 正文 r${receipt.revision} · 草稿`; parent.append(saved);
  }
}
function render() {
  const run = records.get(selected), container = get('result'); get('results').hidden = !records.size;
  get('source').textContent = source;
  const tabs = get('conditions'); tabs.replaceChildren();
  for (const [key, label] of Object.entries(TOOL_SETS)) {
    if (!records.has(key as ToolSetName)) continue;
    const button = document.createElement('button'); button.className = 'secondary'; button.textContent = label; button.type = 'button';
    button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(key === selected));
    button.onclick = () => { selected = key as ToolSetName; selection.value = key; render(); }; tabs.append(button);
  }
  tabs.hidden = records.size < 2;
  const opened = new Set([...container.querySelectorAll<HTMLDetailsElement>('details[open]')].map(item => item.dataset.key));
  container.replaceChildren(); if (!run) return;
  const heading = document.createElement('h2'); heading.textContent = TOOL_SETS[run.toolSet]; container.append(heading);
  const meta = document.createElement('p'); meta.className = 'note';
  meta.textContent = `${run.requests.length} 次模型请求 · ${run.calls.length} 次工具调用 · 输入 ${number(run.usage.input)} / 输出 ${number(run.usage.output)} token`; container.append(meta);
  if (run.error) { const error = document.createElement('p'); error.className = 'tools-error'; error.textContent = run.error; container.append(error); }
  const title = document.createElement('h3'); title.textContent = '本轮工具调用'; container.append(title);
  for (const call of run.calls) {
    const detail = document.createElement('details'), summary = document.createElement('summary'); detail.dataset.key = call.id;
    summary.textContent = `${call.name}${call.state === 'running' ? ' · 正在执行' : call.state === 'failed' ? ' · 未完成' : ''}`;
    detail.append(summary);
    const id = document.createElement('p'); id.className = 'note'; id.textContent = `调用标识：${call.id}`; detail.append(id);
    if (call.state === 'completed') {
      const readable = document.createElement('div'); readable.className = 'tool-output'; readableResult(readable, call.name, call.output); detail.append(readable);
    }
    if (call.error) technical(detail, '执行反馈', call.error);
    const raw = document.createElement('details'), rawSummary = document.createElement('summary'); raw.dataset.key = call.id + ':raw';
    rawSummary.textContent = '参数与原始返回'; raw.append(rawSummary); technical(raw, '调用参数', call.input);
    if (call.state === 'completed') technical(raw, '实际返回', call.output); raw.open = opened.has(raw.dataset.key); detail.append(raw);
    detail.open = opened.has(call.id); container.append(detail);
  }
  if (!run.calls.length) { const empty = document.createElement('p'); empty.textContent = '尚无工具调用记录。'; container.append(empty); }
  markdown(container, '程序独立读回', run.readBack ? `### ${run.readBack.title}\n\n${run.readBack.body}` : run.state === 'running' ? '运行结束后，从本轮工作区独立读取实际草稿。' : '本轮工作区没有已保存的第一章草稿。');
  if (run.readBack) { const saved = document.createElement('p'); saved.className = 'note'; saved.textContent = `正文 r${run.readBack.revision} · 草稿，待人审阅`; container.append(saved); }
  markdown(container, '模型汇报', run.report || (run.state === 'running' ? '等待模型返回。' : '本次没有取得最终汇报。'));
  const raw = document.createElement('details'), summary = document.createElement('summary'); raw.dataset.key = 'raw'; summary.textContent = '实际请求与返回'; raw.append(summary);
  technical(raw, '本轮任务与记录', run); raw.open = opened.has('raw'); container.append(raw);
}
function busy(value: boolean) {
  start.disabled = value; classroom.disabled = value; selection.disabled = value; task.disabled = value;
  stop.hidden = !value; stop.disabled = false; app.setAttribute('aria-busy', String(value));
}
async function follow(run: ToolsRun) {
  currentId = run.id; busy(true);
  try {
    while (true) {
      records.set(run.toolSet, run); render();
      if (run.state !== 'running') break;
      status(`${run.stage}，已等待 ${Math.max(0, Math.floor((Date.now() - Date.parse(run.startedAt)) / 1000))} 秒…`);
      await new Promise(resolve => setTimeout(resolve, 1000)); run = await json<ToolsRun>(`runs/${run.id}`);
    }
    status(run.state === 'completed' ? '模型过程结束，请核对实际草稿与工具记录。' : run.error || run.stage);
  } catch (error) { status((error as Error).message); }
  finally { currentId = undefined; busy(false); }
}
start.onclick = async () => {
  if (!task.value.trim()) { status('请先填写任务。'); task.focus(); return; }
  busy(true); status('正在准备独立教学工作区…');
  try {
    const run = await json<ToolsRun>('run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task: task.value, toolSet: selection.value }) });
    if (source !== '本机运行') records = new Map((await json<ToolsRun[]>('runs/latest')).map(item => [item.toolSet, item]));
    source = '本机运行'; selected = run.toolSet; await follow(run);
  } catch (error) { status((error as Error).message); busy(false); }
};
stop.onclick = async () => {
  if (!currentId) return; stop.disabled = true;
  try { await json(`runs/${currentId}/cancel`, { method: 'POST' }); status('正在停止后续处理…'); }
  catch (error) { status((error as Error).message); stop.disabled = false; }
};
classroom.onclick = async () => {
  classroom.disabled = true; start.disabled = true; status('正在加载课堂实录…');
  try {
    const runs = await json<ToolsRun[]>('classroom'); records = new Map(runs.map(run => [run.toolSet, run]));
    selected = runs[0]?.toolSet ?? 'separate'; source = '课堂实录';
    if (runs[0]) task.value = runs[0].task; selection.value = selected; render(); status('');
  } catch (error) { status((error as Error).message); }
  finally { classroom.disabled = false; start.disabled = false; }
};
void (async () => {
  try {
    const materials = await json<{ defaultTask: string; work: { title: string; purpose: string; requirements: string[]; facts: string[]; outline: unknown[] } }>('materials');
    task.value = materials.defaultTask;
    const work = materials.work;
    renderMarkdown(get('materials'), `## ${work.title}\n\n${work.purpose}\n\n${work.requirements.map(item => '- ' + item).join('\n')}\n\n${work.facts.join('\n\n')}\n\n分散读取提供 read_work、list_chapters、read_chapter、save_draft；组合读取提供 get_writing_context、read_chapter、save_draft。两组使用相同初态与保存规则。`);
    const recent = await json<ToolsRun[]>('runs/latest'); records = new Map(recent.map(run => [run.toolSet, run]));
    selected = recent.at(-1)?.toolSet ?? 'separate'; render(); busy(false);
    const active = recent.find(run => run.state === 'running'); if (active) { selected = active.toolSet; await follow(active); }
  } catch (error) { status('实验资料未能载入：' + (error as Error).message); }
})();
