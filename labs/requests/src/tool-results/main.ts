import '../lab.css';
import '../../../../shared/markdown.css';
import '../tools/style.css';
import './style.css';
import { renderMarkdown } from '../../../../shared/markdown.ts';
import type { ModelRequest, ToolCall, ToolDefinition } from '../tools/contract.ts';
import type { FeedbackRun, Predecessor } from './contract.ts';

const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = `<header><h1>工具反馈实验</h1><p>观察工具返回的新信息，怎样进入下一轮请求与实际操作。</p></header>
  <section class="tools-definitions"><h2>工具定义</h2><div id="definitions"></div></section>
  <details id="basis"><summary>任务依据与当前前文</summary><div class="guide-body"><div id="work"></div>
  <h3>第一章当前正文</h3><label for="previous-title">标题</label><input id="previous-title" maxlength="200">
  <label for="previous-body">正文</label><textarea id="previous-body" rows="10" maxlength="12000"></textarea></div></details>
  <label for="task">任务</label><textarea id="task" rows="4" maxlength="12000"></textarea>
  <div class="tools-controls"><button id="run" disabled>运行任务</button><button id="stop" class="secondary" hidden>停止</button><button id="classroom" class="secondary" disabled>加载课堂实录</button></div>
  <p id="status" role="status" aria-live="polite"></p><section id="results" hidden><p id="source" class="note"></p><div id="result"></div></section>`;
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const task = get<HTMLTextAreaElement>('task'), previousTitle = get<HTMLInputElement>('previous-title'), previousBody = get<HTMLTextAreaElement>('previous-body');
const start = get<HTMLButtonElement>('run'), stop = get<HTMLButtonElement>('stop'), classroom = get<HTMLButtonElement>('classroom');
let run: FeedbackRun | undefined, currentId: string | undefined, source = '本机运行', rendered = false;
let definitions: ToolDefinition[] = [], definitionsKey = '';
const status = (text: string) => { get('status').textContent = text; };
async function json<T>(path: string, init?: RequestInit) {
  const response = await fetch('/api/tool-results/' + path, init), value = await response.json();
  if (!response.ok) throw new Error(value.error || '本机请求未完成，请检查服务。');
  return value as T;
}
function heading(parent: HTMLElement, text: string, level: 'h2' | 'h3' | 'h4' = 'h3') { const title = document.createElement(level); title.textContent = text; parent.append(title); }
function markdown(parent: HTMLElement, text: string) { const body = document.createElement('div'); renderMarkdown(body, text); parent.append(body); return body; }
function technical(parent: HTMLElement, label: string, value: unknown) { const title = document.createElement('p'), pre = document.createElement('pre'); title.textContent = label; pre.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2); parent.append(title, pre); }
function detail(parent: HTMLElement, label: string, key: string, opened: Set<string>) {
  const item = document.createElement('details'), summary = document.createElement('summary'); item.dataset.key = key; summary.textContent = label; item.append(summary); item.open = opened.has(key); parent.append(item); return item;
}
type Work = { title: string; purpose: string; revision?: number; requirements: string[]; facts: string[]; outline: { number: number; titleHint: string; goal: string }[] };
function workText(work: Work) { return `## ${work.title}\n\n${work.purpose}\n\n${work.requirements.map(item => '- ' + item).join('\n')}\n\n${work.facts.join('\n\n')}\n\n## 章节大纲\n\n${work.outline.map(item => `### 第 ${item.number} 章 ${item.titleHint}\n\n${item.goal}`).join('\n\n')}`; }
function readable(parent: HTMLElement, name: string, output: unknown, opened: Set<string>) {
  if (name === 'read_work' && output && typeof output === 'object' && 'requirements' in output) markdown(parent, workText(output as Work));
  else if (name === 'read_chapter' && output && typeof output === 'object' && 'chapter' in output) {
    const current = output as { chapterNumber: number; chapterRevision: number; chapter: { title: string; body: string } | null };
    if (current.chapter) {
      heading(parent, `第 ${current.chapterNumber} 章 ${current.chapter.title}`, 'h4');
      const full = detail(parent, '完整正文', parent.dataset.key + ':body', opened); markdown(full, current.chapter.body);
    } else markdown(parent, `第 ${current.chapterNumber} 章尚未保存草稿。`);
    const note = document.createElement('p'); note.className = 'note'; note.textContent = `正文修订：${current.chapterRevision}`; parent.append(note);
  } else if (name === 'list_chapters' && Array.isArray(output)) markdown(parent, output.length ? output.map(item => `- 第 ${item.number} 章 ${item.title} · r${item.revision}`).join('\n') : '当前没有已保存章节。');
  else if (name === 'save_draft' && output && typeof output === 'object' && 'revision' in output) {
    const receipt = output as { chapterNumber: number; revision: number }; markdown(parent, `第 ${receipt.chapterNumber} 章已保存为草稿 · 正文 r${receipt.revision}`);
  } else markdown(parent, typeof output === 'string' ? output : JSON.stringify(output, null, 2));
}
function parse(value: string) { try { return JSON.parse(value); } catch { return value; } }
function renderDefinitions() {
  const items: ToolDefinition[] = run?.requests[0] ? JSON.parse(run.requests[0].body).tools.map((item: { function: ToolDefinition }) => item.function) : definitions;
  const key = JSON.stringify(items); if (key === definitionsKey) return; definitionsKey = key;
  const container = get('definitions'); container.replaceChildren();
  for (const item of items) {
    const details = document.createElement('details'), summary = document.createElement('summary'), name = document.createElement('code'), description = document.createElement('span');
    name.textContent = item.name; description.textContent = item.description; summary.append(name, description); details.append(summary);
    const pre = document.createElement('pre'); pre.textContent = JSON.stringify(item, null, 2); details.append(pre); container.append(details);
  }
}
function renderCall(parent: HTMLElement, call: ToolCall, opened: Set<string>) {
  const chapter = typeof call.input === 'object' && call.input && 'chapterNumber' in call.input ? ` · 第 ${call.input.chapterNumber} 章` : '';
  const state = call.state === 'running' ? ' · 正在执行' : call.state === 'failed' ? ' · 执行反馈' : '';
  const body = detail(parent, call.name + chapter + state, 'call:' + call.id, opened);
  const id = document.createElement('p'); id.className = 'note'; id.textContent = `调用标识：${call.id}`; body.append(id);
  if (call.state === 'completed') { heading(body, '返回结果：', 'h4'); readable(body, call.name, call.output, opened); }
  if (call.error) markdown(body, call.error);
  const raw = detail(body, '参数与原始返回', 'raw-call:' + call.id, opened); technical(raw, '调用参数', call.input);
  if (call.state === 'completed') technical(raw, '实际返回', call.output);
}
type Message = { role: string; tool_call_id?: string; content?: unknown; tool_calls?: { id: string; function: { name: string; arguments: string } }[] };
function requestMessages(request: ModelRequest): Message[] { return JSON.parse(request.body).messages; }
function render() {
  renderDefinitions(); if (!run) return;
  get('results').hidden = false; get('source').textContent = source;
  const container = get('result'), opened = new Set([...container.querySelectorAll<HTMLDetailsElement>('details[open]')].map(item => item.dataset.key!));
  if (!rendered) opened.add('round:0'); rendered = true; container.replaceChildren();
  if (run.error) markdown(container, run.error).className = 'tools-error';
  heading(container, '本轮过程', 'h2');
  run.requests.forEach((request, index) => {
    const response = request.response as { choices?: { message?: Message }[] } | undefined;
    const reply = response?.choices?.[0]?.message, names = reply?.tool_calls?.map(item => item.function.name);
    const round = detail(container, `第 ${index + 1} 轮模型请求${names?.length ? ' · ' + names.join('、') : reply ? ' · 返回汇报' : ' · 等待返回'}`, 'round:' + index, opened);
    round.className = 'feedback-round';
    const messages = requestMessages(request), previousCount = index ? requestMessages(run!.requests[index - 1]).length : 0;
    const feedback = messages.slice(previousCount).filter(item => item.role === 'tool');
    if (!index) { heading(round, '本轮任务'); markdown(round, run!.task); }
    if (feedback.length) {
      heading(round, '本轮收到的工具反馈');
      for (const message of feedback) {
        const call = run!.calls.find(item => item.id === message.tool_call_id), name = call?.name || message.tool_call_id || '工具';
        const body = detail(round, name + (call && typeof call.input === 'object' && call.input && 'chapterNumber' in call.input ? ` · 第 ${call.input.chapterNumber} 章` : ''), `received:${index}:${message.tool_call_id}`, opened);
        readable(body, name, typeof message.content === 'string' ? parse(message.content) : message.content, opened);
      }
    }
    if (reply?.content) { heading(round, reply.tool_calls?.length ? '模型本轮说明' : '模型汇报'); markdown(round, String(reply.content)); }
    if (reply?.tool_calls?.length) {
      heading(round, '模型提出的调用与实际执行');
      for (const proposed of reply.tool_calls) {
        const call = run!.calls.find(item => item.id === proposed.id);
        renderCall(round, call ?? { id: proposed.id, name: proposed.function.name, input: parse(proposed.function.arguments), state: 'running' }, opened);
      }
    }
    if (request.error) markdown(round, request.error);
    const raw = detail(round, '实际请求与原始返回', 'raw-request:' + index, opened);
    technical(raw, '请求中的全部消息', JSON.parse(request.body)); if (request.response) technical(raw, '模型原始返回', request.response);
  });
  heading(container, '程序独立读回', 'h2');
  markdown(container, run.readBack ? `### 第 2 章 ${run.readBack.title}\n\n${run.readBack.body}` : run.state === 'running' ? '运行结束后读取本轮实际保存结果。' : '本轮尚无已保存的第二章草稿。');
  if (run.readBack) { const note = document.createElement('p'); note.className = 'note'; note.textContent = `正文 r${run.readBack.revision} · 草稿，待人审阅`; container.append(note); }
  const usage = detail(container, '用量', 'usage', opened); markdown(usage, `${run.requests.length} 次模型请求 · 输入 ${run.usage.input ?? '未知'} / 输出 ${run.usage.output ?? '未知'} token`);
}
function busy(value: boolean) { start.disabled = value; classroom.disabled = value; task.disabled = value; previousTitle.disabled = value; previousBody.disabled = value; stop.hidden = !value; stop.disabled = false; app.setAttribute('aria-busy', String(value)); }
async function follow(value: FeedbackRun) {
  currentId = value.id; busy(true);
  try {
    while (true) { run = value; render(); if (value.state !== 'running') break; status(value.stage + '…'); await new Promise(resolve => setTimeout(resolve, 1000)); value = await json<FeedbackRun>('runs/' + value.id); }
    status(value.state === 'completed' ? '' : value.error || value.stage);
  } catch (error) { status((error as Error).message); }
  finally { currentId = undefined; busy(false); }
}
start.onclick = async () => {
  if (!task.value.trim() || !previousTitle.value.trim() || !previousBody.value.trim()) { status('请填写任务、第一章标题和正文。'); return; }
  busy(true); status('正在准备任务…');
  try { const value = await json<FeedbackRun>('run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task: task.value, predecessor: { title: previousTitle.value, body: previousBody.value } }) }); source = '本机运行'; rendered = false; await follow(value); }
  catch (error) { status((error as Error).message); busy(false); }
};
stop.onclick = async () => { if (!currentId) return; stop.disabled = true; try { await json(`runs/${currentId}/cancel`, { method: 'POST' }); status('正在停止后续处理…'); } catch (error) { status((error as Error).message); stop.disabled = false; } };
classroom.onclick = async () => {
  busy(true); status('正在加载课堂实录…');
  try { run = await json<FeedbackRun>('classroom'); task.value = run.task; previousTitle.value = run.predecessor.title; previousBody.value = run.predecessor.body; source = '课堂实录'; rendered = false; render(); status(''); }
  catch (error) { status((error as Error).message); }
  finally { busy(false); }
};
void (async () => { try { const materials = await json<{ defaultTask: string; definitions: ToolDefinition[]; predecessor: Predecessor; work: Work }>('materials'); task.value = materials.defaultTask; previousTitle.value = materials.predecessor.title; previousBody.value = materials.predecessor.body; definitions = materials.definitions; renderMarkdown(get('work'), workText(materials.work)); renderDefinitions(); busy(false); } catch (error) { status('实验资料未能载入：' + (error as Error).message); } })();
