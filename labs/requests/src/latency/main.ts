import './style.css';
import '../lab.css';
import { markdown, renderMarkdown } from '../../../../shared/markdown.ts';
import { CONDITIONS, QUESTION, type Condition } from './materials.ts';
import { usageOf, type ClientEvent, type StreamRecord } from './contract.ts';
import { readEvents } from './sse.ts';

const app = document.querySelector<HTMLElement>('#app')!;
const entries = Object.entries(CONDITIONS) as [Condition, (typeof CONDITIONS)[Condition]][];
app.innerHTML = `
  <header>
    <h1>等待与用量</h1>
    <p>用同一份小说资料，比较输入长度、重复前缀和回答长度。</p>
  </header>
  <section class="experiment">
    <p class="question">${QUESTION}</p>
    <div class="run-controls"><label for="condition">对照条件</label><select id="condition">${entries.map(([key, value], index) => `<option value="${key}">${index + 1}. ${value.label}</option>`).join('')}</select><button id="run">运行本条件</button><button id="classroom" class="secondary">查看课堂实录</button><span class="note">每次调用模型 1 次</span></div>
    <p id="condition-note" class="note"></p>
    <div id="record-controls" class="record-controls" hidden><span id="record-source" class="note"></span><div id="record-choice-wrap"><label for="record-choice">选择记录</label><select id="record-choice"></select></div></div>
    <div id="comparison" class="table-scroll" hidden><table><thead><tr><th>条件</th><th>首段正文</th><th>流结束</th><th>输入 token</th><th>其中命中缓存</th><th>输出 token</th></tr></thead><tbody id="comparison-body"></tbody></table></div>
    <p id="status" role="status" aria-live="polite"></p>
    <div class="answer-area"><div class="section-heading"><h3 id="answer-label">实际回答</h3><span id="answer-state" class="note"></span></div><div id="answer" class="answer"><p class="note">运行后在这里显示真实流式返回。</p></div></div>
  </section>
  <details id="inspector"><summary>查看实际请求、用量和 SSE 事件</summary><div class="inspector-body">
    <div class="download-bar"><button id="download" class="secondary" disabled>下载全部记录</button></div>
    <div id="record-content"><p class="note">原始请求不包含认证请求头；事件时间从后端发起模型请求时算起。</p></div>
  </div></details>
  <details><summary>这些时间与用量怎样读</summary><div class="guide-body"><dl>
    <dt>首段正文</dt><dd>从本机后端发起上游 fetch，到收到第一个非空 delta.content。空角色块、空字符串和用量块不计入。</dd>
    <dt>流结束</dt><dd>同一起点到收到 [DONE]，或上游事件流正常结束。异常中断不冒充完成；finish_reason=length 会标明截断。</dd>
    <dt>事件与 token</dt><dd>一个流式片段可能包含多个 token。事件时间不是模型内部的精确 token 间隔，也不是 GPU 预填充耗时。</dd>
    <dt>缓存用量</dt><dd>命中缓存 token 是输入 token 的子集，不再加一次。字段缺失显示“未提供”，不等于 0；重复前缀也不保证命中。</dd>
    <dt>费用</dt><dd>输入、命中缓存的输入与输出需按当前模型和地域价格分别核算；这里记录实际用量，不按总 token 直接换算费用。</dd>
  </dl></div></details>
  <details id="materials"><summary>查看固定材料与对照条件</summary><div class="guide-body">
    <p>温度 0，不自动重试。单轮等待受网络、服务调度等影响，不是性能排名。</p><p>本实验有 30 条小说原文片段，短材料直接取其中 C01。同一问题放在材料之后。第 3 项与第 2 项请求体完全相同；第 4 项只改最前面的实验版本 A→B，不改变小说资料和问题。</p>
    <p>第 5 项保持长资料，末尾改为约 350 字的说明要求，并将输出上限从 4096 改为 8192 token。上限同时容纳推理与正文；本项同时改变回答长度要求和输出预算，不能把时间差异只归因于其中一个因素。</p>
    <div id="materials-content" class="message-text">展开后加载实际材料。</div>
  </div></details>`;

type Attempt = { source: 'classroom' | 'local'; condition: Condition; record?: StreamRecord; transportError?: string | null; settled: boolean };
const attempts: Attempt[] = [];
let running = false;
let selected = -1;
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const time = (value: number | null) => value === null ? '—' : `${(value / 1000).toFixed(2)} 秒`;
const count = (value: number | null, ended: boolean) => value === null ? ended ? '未提供' : '—' : value.toLocaleString('zh-CN');

function setBusy(value: boolean) {
  running = value;
  get<HTMLButtonElement>('run').disabled = value; get<HTMLButtonElement>('classroom').disabled = value;
  get<HTMLSelectElement>('condition').disabled = value; get<HTMLSelectElement>('record-choice').disabled = value;
  get<HTMLButtonElement>('download').disabled = value || !attempts.length;
}

function renderTable() {
  const current = attempts[selected];
  const group = attempts.filter(item => item.source === current?.source);
  get('comparison').hidden = !current;
  get('comparison-body').innerHTML = entries.map(([condition, info], index) => {
    const attempt = current?.condition === condition ? current : group.findLast((item) => item.condition === condition);
    const record = attempt?.record;
    const usage = usageOf(record?.usage);
    const note = attempt?.transportError ? '连接失败，见明细' : record?.error ? record.error.message : '';
    return `<tr><td><strong>${index + 1}. ${info.label}</strong>${note ? `<small class="error">${escape(note)}</small>` : ''}</td>
      <td>${time(record?.firstContentMs ?? null)}</td><td>${time(record?.streamEndMs ?? null)}</td>
      <td>${count(usage.input, !!attempt?.settled)}</td><td>${count(usage.cached, !!attempt?.settled)}</td><td>${count(usage.output, !!attempt?.settled)}</td></tr>`;
  }).join('');
}

function renderAnswer(attempt: Attempt) {
  get('answer-label').textContent = CONDITIONS[attempt.condition].label;
  renderMarkdown(get('answer'), attempt.record?.answer || (attempt.settled ? '没有收到正文。' : '等待第一段正文…'));
  get('answer-state').textContent = attempt.transportError ? '连接中断' : attempt.record?.finishReason === 'length' ? '输出截断' : attempt.record?.error ? '未完整结束' : attempt.settled ? '' : '接收中';
}

function renderInspector() {
  const choice = get<HTMLSelectElement>('record-choice');
  const sourceLabel = (attempt: Attempt, index: number) => attempt.source === 'classroom' ? '课堂实录' : `本机运行 ${attempts.slice(0, index + 1).filter(item => item.source === 'local').length}`;
  choice.innerHTML = attempts.map((attempt, index) => `<option value="${index}">${sourceLabel(attempt, index)} · ${CONDITIONS[attempt.condition].label}</option>`).join('');
  choice.value = String(selected);
  get('record-controls').hidden = !attempts.length;
  get('record-choice-wrap').hidden = attempts.length < 2; get('record-source').hidden = attempts.length > 1;
  const attempt = attempts[selected];
  if (!attempt) return;
  get('record-source').textContent = sourceLabel(attempt, selected);
  const record = attempt.record;
  const container = get('record-content');
  container.replaceChildren();
  const message = attempt.transportError || record?.error?.message || (!attempt.settled ? '正在接收；完整 SSE 记录在本次结束后显示。' : '');
  if (message) { const note = document.createElement('p'); note.className = attempt.settled ? 'error' : 'meta'; note.textContent = message; container.append(note); }
  if (!record) return;
  const meta = document.createElement('p'); meta.className = 'meta';
  meta.textContent = `HTTP ${record.httpStatus ?? '等待中'} · 实际模型 ${record.responseModel ?? '未提供'} · finish_reason=${record.finishReason ?? '未提供'} · 结束方式=${record.endedBy ?? '未结束'}`;
  container.append(meta);
  const parts = [
    ['实际回答', record.answer],
    ['实际发送给 fetch 的请求体', record.requestBody],
    ['原始 usage', JSON.stringify(record.usage, null, 2)],
    ['SSE 数据事件与后端接收相对时间（毫秒）', JSON.stringify(record.events, null, 2)],
  ];
  for (const [title, text] of parts) {
    const detail = document.createElement('details'); detail.className = 'json';
    const summary = document.createElement('summary'); summary.textContent = title;
    const pre = document.createElement('pre'); pre.textContent = text;
    detail.append(summary, title === '实际回答' ? markdown(text!, 'message-text') : pre); container.append(detail);
  }
}

function renderSelected() {
  renderTable();
  if (attempts[selected]) renderAnswer(attempts[selected]);
  renderInspector();
}

async function run(condition: Condition) {
  if (running) return;
  setBusy(true); get('run').textContent = '接收中…';
  const attempt: Attempt = { source: 'local', condition, settled: false }; attempts.push(attempt); selected = attempts.length - 1;
  const status = get('status'); status.className = ''; status.textContent = `${CONDITIONS[condition].label}：正在发起一次真实模型调用。`;
  renderSelected();
  let receivedComplete = false;
  try {
    const response = await fetch('/api/latency/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ condition }) });
    if (!response.ok) {
      const data = await response.json() as { error?: string };
      throw new Error(data.error || '本机服务未能启动本次调用。');
    }
    if (!response.body) throw new Error('没有收到可读取的事件流。');
    for await (const event of readEvents(response.body)) {
      const data = JSON.parse(event.data) as ClientEvent;
      if (data.type === 'start') attempt.record = data.record;
      else if (data.type === 'delta' && attempt.record) {
        attempt.record.answer += data.text; attempt.record.firstContentMs ??= data.elapsedMs;
      } else if (data.type === 'complete') { attempt.record = data.record; receivedComplete = true; }
      renderAnswer(attempt); renderTable();
    }
    if (!receivedComplete) throw new Error('本机事件连接提前结束；已收到的正文保留，完整用量和事件记录未取得。');
    status.textContent = attempt.record?.error?.message || '';
    if (attempt.record?.error) status.className = 'error';
  } catch (error) {
    attempt.transportError = error instanceof Error ? error.message : '连接失败，已有记录保留，没有自动重试。';
    status.textContent = attempt.transportError; status.className = 'error';
  } finally {
    attempt.settled = true; setBusy(false); get('run').textContent = '运行本条件'; renderSelected();
  }
}

const conditionChoice = get<HTMLSelectElement>('condition');
function describeCondition() { get('condition-note').textContent = CONDITIONS[conditionChoice.value as Condition].description; }
conditionChoice.addEventListener('change', describeCondition);
get('run').addEventListener('click', () => void run(conditionChoice.value as Condition));
get('classroom').addEventListener('click', async () => {
  if (running) return;
  setBusy(true); const status = get('status'); status.className = ''; status.textContent = '正在读取课堂实录……';
  try {
    let index = attempts.findIndex(attempt => attempt.source === 'classroom');
    if (index < 0) {
      const response = await fetch('/requests/records/latency/classroom.json');
      if (!response.ok) throw new Error('classroom-unavailable');
      const data = await response.json() as { runs: Omit<Attempt, 'source'>[] };
      index = attempts.length;
      // 实录直接读取已保存结果，不把历史事件重新当成接收中的流。
      attempts.push(...data.runs.map(attempt => ({ ...attempt, source: 'classroom' as const })));
    }
    selected = index; renderSelected(); status.textContent = '';
  } catch { status.textContent = '课堂实录读取失败，请重试。'; status.className = 'error'; }
  finally { setBusy(false); }
});
describeCondition();
get('record-choice').addEventListener('change', () => {
  if (running) return;
  selected = Number(get<HTMLSelectElement>('record-choice').value); get('status').textContent = ''; get('status').className = ''; renderSelected();
});
get('download').addEventListener('click', () => {
  const payload = { question: QUESTION, runs: attempts.map((attempt) => ({ source: attempt.source, condition: attempt.condition, settled: attempt.settled, transportError: attempt.transportError ?? null, record: attempt.record ?? null })) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = '流式等待-实际请求记录.json'; anchor.click(); URL.revokeObjectURL(url);
});
get<HTMLDetailsElement>('materials').addEventListener('toggle', async () => {
  if (!get<HTMLDetailsElement>('materials').open || get('materials-content').dataset.loaded) return;
  try {
    const response = await fetch('/api/latency/materials');
    if (!response.ok) throw new Error();
    const data = await response.json() as { short: string; long: string };
    renderMarkdown(get('materials-content'), `## 短材料\n\n${data.short}\n\n## 完整长材料\n\n${data.long}`);
    get('materials-content').dataset.loaded = 'true';
  } catch { get('materials-content').textContent = '材料读取失败，请检查本机服务后重新展开。'; }
});
renderTable();
