import '../lab.css';
import '../../../../shared/markdown.css';
import '../tools/style.css';
import './style.css';
import { renderMarkdown } from '../../../../shared/markdown.ts';
import type { ToolCall, ToolDefinition } from '../tools/contract.ts';
import { MODES, SCENARIOS, type Classroom, type ControlGroup, type ControlRun, type Materials, type Scenario, type Variant } from './contract.ts';

const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = `<header><h1>工作流与 Agent 对照实验</h1><p>比较固定读取、模型自主选择与混合安排，观察它们取得了什么依据。</p></header>
  <div class="control-options"><label for="scenario">情境 <select id="scenario"><option value="known">路径已知</option><option value="explore">根据线索补查</option></select></label>
  <label for="variant">练习稿 <select id="variant"><option value="key">练习稿一</option><option value="time">练习稿二</option></select></label></div>
  <section class="tools-definitions"><h2>工具定义</h2><div id="definitions"></div></section>
  <details id="basis"><summary>任务材料</summary><div id="materials"></div></details>
  <label for="task">任务</label><textarea id="task" rows="4" maxlength="12000"></textarea>
  <details id="arrangements"><summary>三组怎样安排</summary><div>
  <p><strong>工作流：</strong>程序固定读取作品要求与第一章，再请模型一次核对；不提供补查工具。</p>
  <p><strong>Agent：</strong>模型从任务出发，自行选择读取、搜索与补查。</p>
  <p><strong>混合方式：</strong>程序先读取作品要求与第一章，再让模型决定是否补查。</p>
  <p>三组使用同一任务、练习稿、资料和模型，依次运行。这只是固定基础读取的基线；也可以另行设计固定检索或读取全部设定的工作流。</p></div></details>
  <div class="tools-controls"><button id="run" disabled>运行对照</button><button id="stop" class="secondary" hidden>停止</button><button id="classroom" class="secondary" disabled>加载课堂实录</button></div>
  <p id="status" role="status" aria-live="polite"></p>
  <section id="results" hidden><p id="source" class="note"></p><div id="result"></div></section>`;
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const scenario = get<HTMLSelectElement>('scenario'), variant = get<HTMLSelectElement>('variant'), task = get<HTMLTextAreaElement>('task');
const start = get<HTMLButtonElement>('run'), stop = get<HTMLButtonElement>('stop'), classroom = get<HTMLButtonElement>('classroom');
let materials: Materials, run: ControlRun | undefined, activeId: string | undefined, source = '本机运行', renderedId = '';
const records = new Map<string, ControlRun>();
const key = () => scenario.value + ':' + variant.value;
const status = (text: string) => { get('status').textContent = text; };
const number = (value: number | null) => value === null ? '未知' : value.toLocaleString('zh-CN');
async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/control/' + path, init), value = await response.json();
  if (!response.ok) throw new Error(value.error || '本机请求未完成，请检查服务。'); return value as T;
}
function markdown(parent: HTMLElement, text: string) { const body = document.createElement('div'); renderMarkdown(body, text); parent.append(body); return body; }
function heading(parent: HTMLElement, text: string, tag: 'h2' | 'h3' | 'h4' = 'h3') { const title = document.createElement(tag); title.textContent = text; parent.append(title); }
function details(parent: HTMLElement, label: string, id: string, opened: Set<string>) {
  const node = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = label; node.dataset.key = id; node.open = opened.has(id); node.append(summary); parent.append(node); return node;
}
function technical(parent: HTMLElement, label: string, value: unknown) { const title = document.createElement('p'), pre = document.createElement('pre'); title.textContent = label; pre.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2); parent.append(title, pre); }
function readable(parent: HTMLElement, name: string, output: unknown) {
  if (name === 'read_work') { const work = output as Materials['work']; markdown(parent, `### ${work.title}\n\n${work.requirements.map(item => '- ' + item).join('\n')}`); }
  else if (name === 'read_chapter' || name === 'read_setting') {
    const document = output as { title?: string; body?: string; message?: string }; markdown(parent, document.body ? `### ${document.title}\n\n${document.body}` : document.message || JSON.stringify(output));
  } else if (name === 'search_settings') {
    const result = output as { query: string; matches: { id: string; title: string; description: string }[]; note?: string };
    markdown(parent, `查询：${result.query}\n\n` + (result.matches.length ? result.matches.map(item => `- **${item.id} · ${item.title}**：${item.description}`).join('\n') : result.note || '没有匹配资料。'));
  } else markdown(parent, typeof output === 'string' ? output : JSON.stringify(output, null, 2));
}
function callResult(parent: HTMLElement, call: ToolCall, prefix: string, opened: Set<string>) {
  const node = details(parent, call.name, prefix + call.id, opened), content = document.createElement('div'); node.append(content);
  if (call.state === 'completed') { heading(content, '返回结果：', 'h4'); readable(content, call.name, call.output); }
  else markdown(content, call.error || '正在执行…');
  const raw = details(content, '参数与原始返回', 'raw:' + prefix + call.id, opened); technical(raw, '调用参数', call.input); if (call.state === 'completed') technical(raw, '实际返回', call.output);
}
type Message = { role: string; content?: unknown; tool_call_id?: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[] };
function renderGroup(parent: HTMLElement, group: ControlGroup, opened: Set<string>) {
  const node = details(parent, MODES[group.mode], 'group:' + group.mode, opened); node.className = 'control-group'; const section = document.createElement('section'); node.append(section);
  if (group.error) markdown(section, group.error).className = 'tools-error';
  heading(section, '实际核对意见'); markdown(section, group.report || (group.state === 'running' ? '等待模型返回…' : '未取得完整意见。')).className = 'report';
  if (group.provided.length) {
    const provided = details(section, '程序预先读取的资料', 'provided:' + group.mode, opened);
    for (const call of group.provided) callResult(provided, call, group.mode + ':provided:', opened);
  }
  const process = details(section, '模型请求与工具过程', 'process:' + group.mode, opened);
  group.requests.forEach((request, index) => {
    const body = JSON.parse(request.body), messages = body.messages as Message[], response = request.response as { choices?: { message?: Message }[] } | undefined;
    const reply = response?.choices?.[0]?.message, calls = reply?.tool_calls || [];
    const round = details(process, `第 ${index + 1} 轮${calls.length ? ' · ' + calls.map(item => item.function.name).join('、') : reply ? ' · 返回意见' : ' · 等待返回'}`, `round:${group.mode}:${index}`, opened);
    const content = document.createElement('div'); round.append(content);
    const previousCount = index ? JSON.parse(group.requests[index - 1].body).messages.length : 0;
    const feedback = messages.slice(previousCount).filter(message => message.role === 'tool');
    if (feedback.length) markdown(content, '**本轮收到的反馈：** ' + feedback.map(message => group.calls.find(call => call.id === message.tool_call_id)?.name || message.tool_call_id).join('、'));
    if (reply?.content && calls.length) markdown(content, String(reply.content));
    for (const proposed of calls) {
      const call = group.calls.find(item => item.id === proposed.id);
      if (call) callResult(content, call, group.mode + ':', opened);
    }
    if (request.error) markdown(content, request.error);
    const raw = details(content, '实际请求与原始返回', `request:${group.mode}:${index}`, opened); technical(raw, '请求', body); if (request.response) technical(raw, '返回', request.response);
  });
  const usage = details(section, '用量与等待', 'usage:' + group.mode, opened);
  markdown(usage, `${group.requests.length} 次模型请求 · 输入 ${number(group.usage.input)} / 输出 ${number(group.usage.output)} token · 等待 ${group.durationMs === undefined ? '尚未结束' : (group.durationMs / 1000).toFixed(1) + ' 秒'}`);
}
function render() {
  get('results').hidden = !run; if (!run) return;
  const container = get('result'), opened = new Set([...container.querySelectorAll<HTMLDetailsElement>('details[open]')].map(node => node.dataset.key!));
  if (renderedId !== run.id) { opened.clear(); opened.add('group:workflow'); renderedId = run.id; }
  container.replaceChildren(); get('source').textContent = `${source} · ${SCENARIOS[run.scenario]} · ${run.variant === 'key' ? '练习稿一' : '练习稿二'}`;
  if (run.error) markdown(container, run.error).className = 'tools-error';
  heading(container, '实际过程对照', 'h2');
  const scroll = document.createElement('div'), table = document.createElement('table'); scroll.className = 'table-scroll'; table.className = 'comparison-table'; scroll.append(table); container.append(scroll);
  const head = table.createTHead().insertRow(); ['控制方式', '程序预读', '模型选择的工具', '模型请求', '本轮状态'].forEach(label => { const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = label; head.append(cell); });
  const body = table.createTBody();
  for (const mode of Object.keys(MODES) as (keyof typeof MODES)[]) {
    const group = run.groups.find(item => item.mode === mode), row = body.insertRow();
    const counts = new Map<string, number>(); group?.calls.forEach(item => counts.set(item.name, (counts.get(item.name) ?? 0) + 1));
    const names = [...counts].map(([name, count]) => `${name} × ${count}`);
    const states = { running: '运行中', completed: '模型已结束', cancelled: '已取消', stopped: '未完整结束', failed: '运行未完成' };
    [MODES[mode], group?.provided.map(item => item.name).join('\n') || '—', names.join('\n') || (group?.state === 'running' ? '等待选择' : '—'), group ? String(group.requests.length) : '—', group ? states[group.state] : '尚未运行'].forEach(text => { const cell = row.insertCell(); cell.textContent = text; });
  }
  markdown(container, '先比较各组实际取得的依据和核对意见，再判断是否解决了任务；“模型已结束”只表示模型正常停止。').className = 'note';
  for (const group of run.groups) renderGroup(container, group, opened);
  const criteria = details(container, '默认任务的核对依据', 'criteria', opened); criteria.id = 'criteria';
  markdown(criteria, run.materials.checks[run.scenario][run.variant]);
}
function renderMaterials() {
  const container = get('materials'); container.replaceChildren();
  markdown(container, materials.provenance).className = 'note';
  readable(container, 'read_work', materials.work); readable(container, 'read_chapter', materials.chapters[variant.value as Variant]);
  const directory = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = '设定资料目录与原文'; directory.append(summary); container.append(directory);
  for (const material of materials.documents) { const item = document.createElement('details'), title = document.createElement('summary'); title.textContent = material.id + ' · ' + material.title; item.append(title); markdown(item, material.body); directory.append(item); }
}
function busy(value: boolean) { start.disabled = value; classroom.disabled = value; scenario.disabled = value; variant.disabled = value; task.disabled = value; stop.hidden = !value; stop.disabled = false; }
function select() { task.value = materials.tasks[scenario.value as Scenario]; run = records.get(key()); if (run) { task.value = run.task; materials = run.materials; } renderMaterials(); render(); status(''); }
async function follow(value: ControlRun) {
  activeId = value.id;
  try {
    while (true) { run = value; records.set(key(), value); render(); if (value.state !== 'running') break; status(value.stage + '…'); await new Promise(resolve => setTimeout(resolve, 1000)); value = await json<ControlRun>('runs/' + value.id); }
    status(value.state === 'completed' ? '' : value.error || value.stage);
  } catch (error) { status((error as Error).message); } finally { activeId = undefined; busy(false); }
}
scenario.onchange = select; variant.onchange = select;
start.onclick = async () => {
  if (!task.value.trim()) { status('请填写任务。'); return; }
  busy(true); status('正在准备对照…');
  try { const value = await json<ControlRun>('run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenario: scenario.value, variant: variant.value, task: task.value }) }); records.clear(); source = '本机运行'; await follow(value); }
  catch (error) { status((error as Error).message); busy(false); }
};
stop.onclick = async () => { if (!activeId) return; stop.disabled = true; try { await json(`runs/${activeId}/cancel`, { method: 'POST' }); status('正在停止后续处理…'); } catch (error) { status((error as Error).message); stop.disabled = false; } };
classroom.onclick = async () => {
  busy(true); status('正在加载课堂实录…');
  try {
    const value = await json<Classroom>('classroom'); records.clear(); value.runs.forEach(item => records.set(item.scenario + ':' + item.variant, item));
    const chosen = records.get(key()) || value.runs[0]; if (!chosen) throw new Error('课堂实录中没有完整对照。');
    scenario.value = chosen.scenario; variant.value = chosen.variant; materials = chosen.materials; source = '课堂实录'; select();
  } catch (error) { status((error as Error).message); } finally { busy(false); }
};
void (async () => {
  try {
    const value = await json<{ materials: Materials; definitions: ToolDefinition[] }>('materials'); materials = value.materials;
    for (const definition of value.definitions) {
      const node = document.createElement('details'), summary = document.createElement('summary'), name = document.createElement('code'), description = document.createElement('span');
      name.textContent = definition.name; description.textContent = definition.description; summary.append(name, description); node.append(summary); technical(node, '完整工具定义', definition); get('definitions').append(node);
    }
    select(); busy(false);
  } catch (error) { status('实验资料未能载入：' + (error as Error).message); }
})();
