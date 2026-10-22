import '../lab.css';
import './style.css';
import { markdown } from '../../../../shared/markdown.ts';
import { CONDITIONS, QUESTION, type Condition, type DisclosureRun } from './contract.ts';
import { createMaterialBrowser } from './material-browser.ts';

document.querySelector('#app')!.innerHTML = `
  <header><h1>渐进式信息披露</h1><p>围绕当前续写任务，按需展开人物、场景与原文依据。</p></header>
  <details id="materials"><summary>预览创作资料</summary><div id="material-browser"></div></details>
  <div id="question"></div>
  <div class="disclosure-controls"><label>实验条件 <select id="condition"></select></label><button id="run" disabled>运行实验</button><button id="classroom" class="secondary" disabled>查看课堂实录</button><button id="stop" class="secondary" hidden>停止</button></div>
  <p id="status" role="status" aria-live="polite"></p>
  <div id="record-bar" hidden><label>查看记录 <select id="history"></select></label></div>
  <section id="result" hidden></section>`;
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const condition = el<HTMLSelectElement>('condition'), history = el<HTMLSelectElement>('history');
const start = el<HTMLButtonElement>('run'), stop = el<HTMLButtonElement>('stop'), classroom = el<HTMLButtonElement>('classroom'), status = el('status');
el('question').append(markdown(QUESTION));
Object.entries(CONDITIONS).forEach(([id, name]) => condition.add(new Option(name, id)));
type RunSummary = Pick<DisclosureRun, 'id' | 'condition' | 'startedAt' | 'state'>;
let localRuns: RunSummary[] = [], selected = '', busy = false;
let controller: AbortController | undefined;
let materials: ReturnType<typeof createMaterialBrowser> | undefined;
function detail(title: string, content: HTMLElement) {
  const box = document.createElement('details'), label = document.createElement('summary'); label.textContent = title; box.append(label, content); return box;
}
function raw(value: unknown) { const pre = document.createElement('pre'); pre.textContent = JSON.stringify(value, null, 2); return pre; }
function paragraph(text: string, className = '') { const p = document.createElement('p'); p.textContent = text; p.className = className; return p; }
function setBusy(value: boolean) {
  busy = value; start.disabled = value; condition.disabled = value; classroom.disabled = value; history.disabled = value;
}
function renderHistory() {
  const recorded = localRuns.map((run, index) => new Option(`运行 ${index + 1} · ${CONDITIONS[run.condition]}${run.state === 'completed' ? '' : ' · 未完成'}`, run.id));
  const archived = Object.entries(CONDITIONS).map(([id, name]) => new Option(`课堂实录 · ${name}`, `classroom:${id}`));
  const placeholder = new Option('请选择', ''); placeholder.disabled = true;
  history.replaceChildren(...(selected ? [] : [placeholder]), ...recorded.reverse(), ...archived); history.value = selected;
  el('record-bar').hidden = !selected && !localRuns.length;
}
async function loadRuns() {
  const response = await fetch('/api/disclosure/runs'); if (!response.ok) throw new Error('运行记录无法读回。');
  localRuns = await response.json() as RunSummary[]; renderHistory();
}
function show(run: DisclosureRun, key: string) {
  selected = key; renderHistory();
  const result = el('result'); result.hidden = false; result.replaceChildren();
  status.textContent = run.error || '';
  const overview = run.condition === 'tiered' ? `首次提供 ${run.supplied.length} 份资料，后续读取 ${run.reads.length} 次。`
    : run.condition === 'summary' ? `从 ${run.supplied.length} 份原文生成摘要，再根据摘要回答。` : `一次提供 ${run.supplied.length} 份资料。`;
  result.append(paragraph(overview, 'disclosure-overview'));
  const heading = document.createElement('h2'); heading.textContent = '实际回答'; result.append(heading);
  const answer = markdown(run.answer || '本次没有取得完整回答。'); answer.classList.add('disclosure-answer'); result.append(answer);
  if (run.summary !== undefined) result.append(detail('本次生成的摘要', markdown(run.summary)));
  const process = document.createElement('div');
  for (const entry of run.supplied) process.append(detail(`${run.condition === 'summary' ? '生成摘要时提供' : '首次提供'}：${entry.path}`, markdown(entry.text)));
  for (const read of run.reads) process.append(detail(`第 ${read.request} 次请求后读取：${read.path}`, markdown(read.text)));
  result.append(detail('实际披露过程', process));
  const records = document.createElement('div'); records.id = 'requests';
  // 缺失的用量或等待保持未知，缓存与推理细分不重复累加。
  const total = (value: (request: DisclosureRun['requests'][number]) => unknown) => {
    const values = run.requests.map(value);
    return values.length && values.every(item => typeof item === 'number' && Number.isFinite(item)) ? (values as number[]).reduce((a, b) => a + b, 0) : null;
  };
  const usage = (request: DisclosureRun['requests'][number]) => request.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
  const input = total(request => usage(request)?.prompt_tokens), output = total(request => usage(request)?.completion_tokens), elapsed = total(request => request.durationMs);
  const number = (value: number | null) => value === null ? '未提供' : value.toLocaleString('zh-CN');
  records.append(paragraph(`请求 ${run.requests.length} 次 · 累计输入 ${number(input)} token · 累计输出 ${number(output)} token · 累计请求等待 ${elapsed === null ? '未提供' : (elapsed / 1000).toFixed(2) + ' 秒'}`, 'request-totals'));
  run.requests.forEach(request => {
    const body = document.createElement('div'); body.append(detail('实际发送的输入', raw(JSON.parse(request.requestBody))), detail('模型返回与用量', raw(request)));
    records.append(detail(request.step, body));
  });
  result.append(detail('运行记录', records));
}
async function loadRecord(key: string) {
  setBusy(true); status.textContent = key.startsWith('classroom:') ? '正在加载课堂实录…' : '正在读取记录…';
  try {
    const path = key.startsWith('classroom:') ? `/requests/records/disclosure/novel/${key.slice(10)}.json` : `/api/disclosure/runs/${key}`;
    const response = await fetch(path); if (!response.ok) throw new Error(key.startsWith('classroom:') ? '课堂实录无法读回。' : '该记录无法读回。');
    show(await response.json() as DisclosureRun, key);
  } catch (error) { history.value = selected; status.textContent = (error as Error).message; }
  finally { setBusy(false); }
}
start.addEventListener('click', async () => {
  if (busy) return;
  setBusy(true); stop.hidden = false; controller = new AbortController();
  const startedAt = Date.now(), name = CONDITIONS[condition.value as Condition];
  const progress = () => { status.textContent = `正在运行“${name}”，已等待 ${Math.floor((Date.now() - startedAt) / 1000)} 秒…`; };
  progress(); const timer = window.setInterval(progress, 1000);
  try {
    const response = await fetch('/api/disclosure/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ condition: condition.value }), signal: controller.signal });
    const run = await response.json() as DisclosureRun;
    localRuns.push({ id: run.id, condition: run.condition, startedAt: run.startedAt, state: run.state });
    clearInterval(timer); show(run, run.id); await loadRuns();
  } catch (error) { status.textContent = controller.signal.aborted ? '已停止。刷新页面后，可在“查看记录”中查找本机保存的部分结果。' : error instanceof Error ? error.message : '无法连接实验服务。'; }
  finally { clearInterval(timer); controller = undefined; setBusy(false); stop.hidden = true; }
});
stop.addEventListener('click', () => controller?.abort());
classroom.addEventListener('click', () => { if (!busy) void loadRecord(`classroom:${condition.value}`); });
history.addEventListener('change', () => { if (!busy && history.value) void loadRecord(history.value); });
void (async () => {
  try {
    const response = await fetch('/api/disclosure/materials'); if (!response.ok) throw new Error('资料目录无法读回。');
    const data = await response.json() as { paths: string[] }; materials = createMaterialBrowser(el('material-browser'), data.paths);
    void materials.select('全书入口.md'); await loadRuns(); setBusy(false);
  } catch (error) { status.textContent = (error as Error).message; classroom.disabled = false; }
})();

// 资料链接复用预览入口，并将读者带到所选资料的位置。
el('app').addEventListener('click', event => {
  const link = (event.target as Element).closest('a');
  const href = link?.getAttribute('href');
  const path = href ? materials?.resolve(href) : undefined;
  if (!path || !materials) return;
  event.preventDefault(); const preview = el<HTMLDetailsElement>('materials'); preview.open = true; void materials.select(path); preview.scrollIntoView({ block: 'start' });
});
