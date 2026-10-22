import './style.css';
import '../lab.css';
import { MATERIALS } from './materials.ts';
import { MODES, type Mode, type StructuredResponse, type StructuredRun } from './contract.ts';
import { COUNTEREXAMPLE, COUNTEREXAMPLE_CHECK } from './counterexample.ts';

document.querySelector<HTMLElement>('#app')!.innerHTML = `<header><h1>待办提取对照</h1><p>用三种输出方式提取同一份资料，对照原文核查任务、负责人和日期。</p></header>
  <div class="input-controls"><label for="mode">输出方式<select id="mode"></select></label></div>
  <details><summary>查看或修改小说资料</summary><label for="minutes" class="sr-only">小说资料，可直接修改</label><textarea id="minutes" rows="7" maxlength="5000"></textarea></details>
  <div class="action-bar"><button id="extract" disabled>提取待办</button><button id="classroom" class="secondary">查看课堂实录</button><button id="local" class="secondary" hidden>返回本机结果</button><span class="note">提取一次调用模型 1 次</span></div>
  <p id="status" role="status" aria-live="polite"></p>
  <section id="result" hidden><div class="section-heading"><h2>提取结果</h2><div class="record-tools"><span id="result-source" class="meta"></span><label for="record-choice" class="sr-only">查看记录</label><select id="record-choice"></select></div></div>
    <div id="checks" class="checks"></div><p class="note">字段合格和原句存在都不能代替语义核查；也不能证明没有漏提。</p>
    <div class="comparison"><section><h3>本次输入原文</h3><pre id="source"></pre></section><section><h3>解析后的待办</h3><div id="items"></div></section></div>
    <details><summary>模型原始正文</summary><pre id="raw-answer"></pre></details>
    <details><summary>实际请求、原始响应与用量</summary><div class="inspector-body"><button id="download" class="secondary">下载全部记录</button><div id="inspector"></div></div></details>
  </section>
  <details id="schema-panel"><summary>型号与 JSON Schema</summary><div class="inspector-body"><p id="model" class="note">正在读取型号…</p><p class="note">JSON Schema 描述字段结构，程序据此检查返回值。owner、dueText必须有字段，未知时为null；items允许为空。</p><pre id="schema"></pre></div></details>
  <details id="counterexample"><summary>人工反例：字段合格，也可能填错负责人</summary><div class="inspector-body"><p class="note">以下由人构造，没有调用模型，不计入实际请求记录。</p>
    <h3>原文</h3><p id="counter-source"></p><h3>人工构造的错误结果</h3><pre id="counter-output"></pre><p id="counter-check"></p><p>原文是三叔嘱咐韩立不要离开院子，人工反例却把执行人写成三叔。结构符合约定，引用也确实存在，仍然是错误提取。</p></div></details>`;

const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const paragraph = (text: string, className = '') => { const p = document.createElement('p'); p.textContent = text; p.className = className; return p; };
Object.entries(MODES).forEach(([value, label]) => get<HTMLSelectElement>('mode').add(new Option(label, value)));
get<HTMLTextAreaElement>('minutes').value = MATERIALS[0].text;
get('counter-source').textContent = COUNTEREXAMPLE.material;
get('counter-output').textContent = JSON.stringify(COUNTEREXAMPLE.output, null, 2);
get('counter-check').textContent = `字段结构：${COUNTEREXAMPLE_CHECK.data ? '符合约定' : '未符合'}；原句定位：${COUNTEREXAMPLE_CHECK.evidence?.[0].found ? '原句存在' : '未定位'}。`;
type Attempt = { label: string; mode: Mode; material: string; run: StructuredRun | null; transportError: string | null };
const attempts: Attempt[] = [];
let classroomRecord: { model: string; attempts: Attempt[] } | undefined;
let classroomView = false, classroomCurrent = -1;
let current = -1;
let busy = false;
let configured = false;
let model = '';

function setBusy(value: boolean) {
  busy = value;
  get<HTMLButtonElement>('extract').disabled = value || !configured;
  for (const id of ['minutes', 'mode', 'record-choice']) get<HTMLTextAreaElement | HTMLSelectElement>(id).disabled = value;
  for (const id of ['classroom', 'local', 'download']) get<HTMLButtonElement>(id).disabled = value;
}

function render() {
  const records = classroomView ? classroomRecord?.attempts ?? [] : attempts;
  const selected = classroomView ? classroomCurrent : current;
  const attempt = records[selected]; const run = attempt?.run;
  const error = attempt?.transportError || run?.error?.message;
  if (!busy) get('status').textContent = error || '';
  get('status').className = error && !busy ? 'error' : '';
  setBusy(busy);
  get('local').hidden = !classroomView;
  get('result').hidden = !attempt;
  const select = get<HTMLSelectElement>('record-choice'); select.replaceChildren(...records.map((item, i) => new Option(`${i + 1} · ${item.label} · ${MODES[item.mode]}`, String(i)))); select.value = String(selected); select.hidden = records.length < 2;
  get('result-source').textContent = `${classroomView ? '课堂实录' : '本机运行'}${attempt && records.length === 1 ? ' · ' + MODES[attempt.mode] : ''}`;
  if (!attempt) return;
  get('source').textContent = attempt.material;
  get('raw-answer').textContent = run?.rawAnswer === '' ? '（正文为空）' : run?.rawAnswer ?? (busy ? '等待返回…' : '没有取得模型正文。拒绝信息与其他字段可在原始响应中查看。');
  const checks = get('checks'); checks.replaceChildren();
  for (const check of run?.inspection?.checks ?? []) {
    const row = document.createElement('details'); row.className = `check ${check.status}`;
    const title = document.createElement('summary'); title.textContent = `${check.label} · ${check.status === 'pass' ? '已检查' : check.status === 'fail' ? '未通过' : '未执行'}`;
    row.append(title, paragraph(check.detail)); checks.append(row);
  }
  if (!run?.inspection) checks.append(paragraph(error || '尚未取得可检查的响应。', error ? 'error' : 'note'));
  const items = get('items'); items.replaceChildren();
  if (!run?.inspection?.data) items.append(paragraph('尚无通过结构检查的结果。没有把失败替换成空列表。', 'note'));
  else if (run.inspection.data.items.length === 0) items.append(paragraph('items: [] · 返回了合法空列表，仍需回看资料确认是否漏提。'));
  else run.inspection.data.items.forEach((item, index) => {
    const section = document.createElement('article'); section.className = 'task';
    const heading = document.createElement('h4'); heading.textContent = `${index + 1}. ${item.task || '（空任务文字）'}`;
    const text = (value: string | null) => value === null ? '未提供（null）' : value || '空字符串';
    section.append(heading, paragraph(`负责人：${text(item.owner)}　截止：${text(item.dueText)}`, 'meta'), paragraph(item.evidence, 'quote'),
      paragraph(run.inspection!.evidence![index].found ? '原句存在；尚未核验它是否支持此项待办。' : '原句未定位，请对照原文检查。', 'note'));
    items.append(section);
  });
  const inspector = get('inspector'); inspector.replaceChildren();
  if (run?.request) {
    for (const [label, value] of [['实际请求体', run.request.requestBody], ['原始响应消息', JSON.stringify(run.request.responseMessage ?? null, null, 2)],
      ['请求状态与用量', JSON.stringify({ model: run.request.responseModel, httpStatus: run.request.httpStatus, finishReason: run.request.finishReason, usage: run.request.usage ?? null, durationMs: run.request.durationMs, error: run.error }, null, 2)]]) {
      const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = label;
      const pre = document.createElement('pre'); pre.textContent = value; details.append(summary, pre); inspector.append(details);
    }
  } else inspector.append(paragraph(error || '尚无请求记录。'));
}

get('record-choice').addEventListener('change', () => {
  if (busy) return;
  const selected = Number(get<HTMLSelectElement>('record-choice').value);
  if (classroomView) classroomCurrent = selected; else current = selected;
  render();
});
get('extract').addEventListener('click', async () => {
  if (busy || !configured) return;
  const material = get<HTMLTextAreaElement>('minutes').value;
  if (!material.trim()) { get('status').textContent = '请先输入小说资料。'; get('status').className = 'error'; return; }
  const selected = MATERIALS[0];
  const attempt: Attempt = { label: selected.label + (material === selected.text ? '' : '（已编辑）'), mode: get<HTMLSelectElement>('mode').value as Mode, material, run: null, transportError: null };
  attempts.push(attempt); current = attempts.length - 1; classroomView = false; setBusy(true);
  get('status').textContent = '正在提取，保留本次原始响应…'; render();
  try {
    const response = await fetch('/api/structured/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ material, mode: attempt.mode }) });
    const data = await response.json() as StructuredResponse & { error?: string };
    if (!data.run) throw new Error(data.error || '没有收到实验记录。');
    attempt.run = data.run;
  } catch (error) { attempt.transportError = error instanceof Error ? error.message : '本机连接中断，没有自动重试。'; }
  finally { setBusy(false); render(); }
});
get('classroom').addEventListener('click', async () => {
  if (busy) return;
  setBusy(true); get('status').className = ''; get('status').textContent = '正在读取课堂实录……';
  try {
    if (!classroomRecord) {
      const response = await fetch('/requests/records/structured/classroom.json');
      if (!response.ok) throw new Error('classroom-unavailable');
      classroomRecord = await response.json() as { model: string; attempts: Attempt[] };
      classroomCurrent = classroomRecord.attempts.findIndex(attempt => attempt.mode === 'strict');
    }
    classroomView = true; render(); get('status').textContent = '';
  } catch { get('status').textContent = '课堂实录读取失败，请重试。'; get('status').className = 'error'; }
  finally { setBusy(false); }
});
get('local').addEventListener('click', () => { if (busy) return; classroomView = false; render(); });
get('download').addEventListener('click', () => {
  const payload = classroomView ? classroomRecord! : { model, attempts };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = '结构化提取-实际请求记录.json'; a.click(); URL.revokeObjectURL(url);
});
async function loadInfo() {
  try {
    const response = await fetch('/api/structured/info'); if (!response.ok) throw new Error('未能读取实验配置，请刷新页面。');
    const info = await response.json() as { model: string; schema: unknown };
    model = info.model; get('model').textContent = `${model} · 每次一次独立请求`;
    get('schema').textContent = JSON.stringify(info.schema, null, 2); configured = true; render();
  } catch (error) { get('status').className = 'error'; get('status').textContent = error instanceof Error ? error.message : '实验配置未能读取。'; }
}
void loadInfo();
window.addEventListener('model-settings-changed', () => { void loadInfo(); });
