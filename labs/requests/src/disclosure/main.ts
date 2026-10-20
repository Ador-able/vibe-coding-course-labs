import '../lab.css';
import './style.css';
import { markdown } from '../../../../shared/markdown.ts';
import { CONDITIONS, QUESTION, type DisclosureRun, type Material } from './contract.ts';

document.querySelector('#app')!.innerHTML = `
  <header><h1>渐进式披露</h1><p>先提供入口，再按当前问题取得目录和原文。</p></header>
  <div id="question"></div>
  <div class="disclosure-controls"><label>实验条件 <select id="condition"></select></label><button id="run">运行实验</button><button id="classroom" class="secondary">查看课堂实录</button><button id="stop" class="secondary" hidden>停止</button></div>
  <p class="note">沿用顶部的共用模型设置，会产生实际用量。</p><p id="status" role="status"></p>
  <section id="result" hidden></section>
  <details><summary>预览现有资料</summary><div class="disclosure-controls"><label>资料 <select id="material"></select></label><button id="preview" class="secondary">查看</button></div><div id="material-text"></div></details>
  <details id="records"><summary>运行记录</summary><label>查看运行记录 <select id="history"><option value="">请选择</option></select></label><div id="requests"></div><a id="download" hidden>下载本次记录</a></details>
  <p class="note"><a href="./history/课堂实录.html">查看历史课堂实录</a></p>`;
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const condition = el<HTMLSelectElement>('condition'), history = el<HTMLSelectElement>('history'), material = el<HTMLSelectElement>('material');
const start = el<HTMLButtonElement>('run'), stop = el<HTMLButtonElement>('stop'), status = el('status');
el('question').append(markdown(QUESTION.split('\n\n')[0]));
Object.entries(CONDITIONS).forEach(([id, name]) => condition.add(new Option(name, id)));
let controller: AbortController | undefined;
function detail(title: string, content: HTMLElement) {
  const box = document.createElement('details'), label = document.createElement('summary'); label.textContent = title; box.append(label, content); return box;
}
function raw(value: unknown) { const pre = document.createElement('pre'); pre.textContent = JSON.stringify(value, null, 2); return pre; }
function show(run: DisclosureRun, recordUrl = `/api/disclosure/runs/${run.id}`) {
  const result = el('result'); result.hidden = false; result.replaceChildren();
  status.textContent = run.error || (run.state === 'completed' ? '已完成' : '未完成');
  if (run.condition === 'tiered') {
    const heading = document.createElement('h2'); heading.textContent = '实际披露过程'; result.append(heading);
    for (const entry of run.supplied) result.append(detail(`首次提供：${entry.path}`, markdown(entry.text)));
    for (const read of run.reads) result.append(detail(`第 ${read.request} 次请求后读取：${read.path}`, markdown(read.text)));
    if (!run.reads.length) { const p = document.createElement('p'); p.textContent = '本次没有发生后续读取；回答正确也不能证明原文已进入上下文。'; result.append(p); }
    if (run.answer) result.append(detail('实际回答', markdown(run.answer)));
  } else if (run.answer) { const h = document.createElement('h2'); h.textContent = '实际回答'; result.append(h, markdown(run.answer)); }
  if (run.summary !== undefined) result.append(detail('本次生成的摘要', markdown(run.summary)));
  const records = el('requests'); records.replaceChildren();
  run.requests.forEach((request, index) => {
    const body = document.createElement('div'); body.append(detail('实际发送的输入', raw(JSON.parse(request.requestBody))), detail('模型返回与用量', raw(request)));
    records.append(detail(`第 ${index + 1} 次请求：${request.step}`, body));
  });
  const download = el<HTMLAnchorElement>('download'); download.hidden = false; download.href = recordUrl; download.download = `渐进式披露-${run.id}.json`;
}
async function loadRuns(selected?: string) {
  const response = await fetch('/api/disclosure/runs'); if (!response.ok) throw new Error('运行记录无法读回。');
  const runs = await response.json() as DisclosureRun[]; history.replaceChildren(new Option('请选择', ''));
  runs.forEach((run, index) => history.add(new Option(`运行 ${index + 1} · ${run.state === 'completed' ? '已完成' : '未完成'} · ${CONDITIONS[run.condition]}`, run.id)));
  if (selected) history.value = selected;
}
start.addEventListener('click', async () => {
  start.disabled = true; condition.disabled = true; stop.hidden = false; controller = new AbortController(); status.textContent = '运行中';
  try {
    const response = await fetch('/api/disclosure/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ condition: condition.value }), signal: controller.signal });
    const run = await response.json() as DisclosureRun; show(run); await loadRuns(run.id);
  } catch (error) { status.textContent = controller.signal.aborted ? '已停止。已有返回保存后可在运行记录中查看。' : error instanceof Error ? error.message : '无法连接实验服务。'; }
  finally { controller = undefined; start.disabled = false; condition.disabled = false; stop.hidden = true; }
});
stop.addEventListener('click', () => controller?.abort());
el('classroom').addEventListener('click', async () => {
  try {
    const url = `/requests/records/disclosure/${condition.value}.json`; const response = await fetch(url);
    if (!response.ok) throw new Error('课堂实录无法读回。'); show(await response.json(), url);
  } catch (error) { status.textContent = (error as Error).message; }
});
el<HTMLDetailsElement>('records').addEventListener('toggle', () => {
  if (el<HTMLDetailsElement>('records').open) void loadRuns(history.value).catch(error => { status.textContent = error.message; });
});
history.addEventListener('change', async () => {
  if (!history.value) return;
  try { const response = await fetch(`/api/disclosure/runs/${history.value}`); if (!response.ok) throw new Error('该记录无法读回。'); show(await response.json()); }
  catch (error) { status.textContent = (error as Error).message; }
});
el('preview').addEventListener('click', async () => {
  try {
    const response = await fetch(`/api/disclosure/materials?path=${encodeURIComponent(material.value)}`); if (!response.ok) throw new Error('资料无法读回。');
    const source = await response.json() as Material; el('material-text').replaceChildren(markdown(source.text));
  } catch (error) { status.textContent = (error as Error).message; }
});
void (async () => {
  try {
    const response = await fetch('/api/disclosure/materials'); if (!response.ok) throw new Error('资料目录无法读回。');
    const data = await response.json() as { paths: string[] }; data.paths.forEach(path => material.add(new Option(path, path))); material.value = '入口.md'; await loadRuns();
  } catch (error) { status.textContent = (error as Error).message; start.disabled = true; }
})();
