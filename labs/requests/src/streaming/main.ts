import './style.css';
import { markdown } from '../../../../shared/markdown.ts';
import { MATERIAL } from './material.ts';
import { DefaultChatTransport, readUIMessageStream } from 'ai';
import type { AssistantMessage, Chunk, RunRecord, State } from './contract.ts';

document.querySelector<HTMLElement>('#app')!.innerHTML = `<header><h1>小说资料整理</h1></header>
  <details id="material-panel"><summary>查看或修改小说资料</summary><label for="material" class="sr-only">凡人修仙传原文</label><textarea id="material" rows="7" maxlength="6000"></textarea></details>
  <div class="actions"><button id="run">生成摘要和问题</button><button id="stop" class="secondary" hidden>停止</button><button id="classroom" class="secondary">查看课堂实录</button><button id="local" class="secondary" hidden>返回本机运行</button></div>
  <p id="status" role="status" aria-live="polite"></p>
  <p id="source" class="note" hidden></p>
  <section id="assistant" hidden><div class="message-heading"><h2>助手回复</h2><span id="progress" class="progress" role="status" aria-live="polite"></span></div><div id="message"></div></section>
  <details id="records" hidden><summary>查看事件与请求记录</summary><div class="inspector-body"><div class="record-tools"><label id="attempt-choice" for="attempt">请求<select id="attempt"></select></label><label for="event-view">事件<select id="event-view"><option value="boundaries">阶段与结束</option><option value="all">全部（含文字增量）</option></select></label><button id="download" class="secondary">下载全部记录</button></div>
    <p id="record-label" class="note"></p><p id="metadata" class="note"></p>
    <div class="table-scroll"><table><thead><tr><th>顺序 / 毫秒</th><th>UI事件</th><th>内容</th></tr></thead><tbody id="events"></tbody></table></div>
    <details><summary>原始数据与记录口径</summary><div class="record-explanation"><p id="model" class="note"></p><p class="note">事件保留原始编号与计时。课堂实录读取已有记录，不重新请求模型。</p><p id="timing-source" class="note"></p><p class="note">供应商片段计时始于后台各阶段请求。导出保留实际请求和收到的JSON片段，不含SSE分隔符或[DONE]。未报告用量记为null，片段数不等于token数。</p></div><pre id="raw-record"></pre></details></div></details>`;
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
get<HTMLTextAreaElement>('material').value = MATERIAL;
type Attempt = { id: string; material: string; state: State; message: AssistantMessage | null; events: { elapsedMs: number; event: Chunk }[]; serverRecord: RunRecord | null; error: string | null; snapshots: { eventCount: number; elapsedMs: number; message: AssistantMessage }[]; stopRequests: { beganAt: string; status: number | null; response: unknown }[] };
type AttemptView = Readonly<Pick<Attempt, 'id' | 'state' | 'message' | 'events' | 'error'>>;
type ClassroomRecord = { cases: { record: RunRecord; finalMessage: AssistantMessage | null; error: string | null; [key: string]: unknown }[]; http: { path: string; method: string; [key: string]: unknown }[]; [key: string]: unknown };
const attempts: Attempt[] = [];
let classroomRecord: ClassroomRecord | null = null;
let classroomAttempts: AttemptView[] = [];
let classroomCurrent = 0; let showingClassroom = false; let loadingClassroom = false; let loadError = '';
declare global { interface Window { streamingObservation: () => { attempts: Attempt[] }; } }
window.streamingObservation = () => structuredClone({ attempts });
let current = -1; let busy = false; let stopping = false;
let modelLabel = '未读取到模型配置';
const stateLabel = { running: '进行中', completed: '已完成', stopped: '已停止，未完成', failed: '未完成' };

function eventDescription(event: Chunk) {
  if (event.type === 'text-delta') return `${event.id}：${event.delta}`;
  if (event.type === 'data-progress') return `${event.id} → ${event.data.label}`;
  if (event.type === 'start') return `消息 ${event.messageId}`;
  if (event.type === 'text-start' || event.type === 'text-end') return event.id;
  if (event.type === 'finish') return `整条消息结束 · ${event.finishReason}`;
  if (event.type === 'error') return event.errorText;
  if (event.type === 'abort') return event.reason || '中止';
  if (event.type === 'message-metadata') return '更新消息的状态、型号与各阶段用量';
  if (event.type === 'finish-step') return '本次模型调用结束';
  if (event.type === 'start-step') return '本次模型调用开始';
  return event.type;
}
function render() {
  const items = showingClassroom ? classroomAttempts : attempts;
  const selected = showingClassroom ? classroomCurrent : current;
  const attempt = items[selected]; const pending = busy || loadingClassroom;
  get<HTMLButtonElement>('run').disabled = pending || showingClassroom; get<HTMLTextAreaElement>('material').disabled = pending || showingClassroom;
  get('material-panel').hidden = showingClassroom;
  get<HTMLButtonElement>('classroom').disabled = pending;
  get('local').hidden = !showingClassroom; get<HTMLButtonElement>('local').disabled = pending;
  get('stop').hidden = !busy; get<HTMLButtonElement>('stop').disabled = stopping || !attempt?.events.some(({ event }) => event.type === 'start');
  get('stop').textContent = stopping ? '正在停止…' : '停止';
  get('status').textContent = loadError || (loadingClassroom ? '正在读取课堂实录…' : attempt?.error || '');
  get('status').className = loadError || attempt?.state === 'failed' ? 'error' : '';
  get('source').hidden = !attempt; get('source').textContent = showingClassroom ? '课堂实录' : `本机运行 ${current + 1}`;
  get('model').textContent = showingClassroom ? `${attempt?.message?.metadata?.model} · 完整任务调用两次` : modelLabel;
  get('timing-source').textContent = showingClassroom ? '表中毫秒直接使用历史后台记录的 uiEvents 计时。原始数据另保留当时浏览器收到事件的时间和消息快照。' : 'UI计时始于浏览器请求。';
  get('assistant').hidden = !attempt; get('records').hidden = !attempt;
  if (!attempt) return;
  const progress = attempt.message?.parts.find((part) => part.type === 'data-progress');
  const stageLabel = { summary: '生成摘要', questions: '生成待确认问题', running: '正在开始', completed: '已完成', stopped: '已停止', failed: '未完成' };
  get('progress').textContent = stopping ? '正在停止' : attempt.error ? ''
    : progress?.type === 'data-progress' ? stageLabel[progress.data.stage] : '正在开始';
  const content = get('message'); content.replaceChildren();
  const textParts = attempt.message?.parts.filter((part) => part.type === 'text') ?? [];
  textParts.forEach((part, i) => {
    const section = document.createElement('section'); const heading = document.createElement('h3'); heading.textContent = i === 0 ? '摘要' : '待确认问题';
    section.setAttribute('aria-label', i === 0 ? '摘要正文' : '待确认问题正文');
    section.dataset.hasText = String(part.text.length > 0);
    section.append(heading, markdown(part.text || (attempt.state === 'running' ? '等待正文片段…' : '未收到正文。'), 'answer')); content.append(section);
  });
  const metadata = attempt.message?.metadata;
  get('metadata').textContent = metadata ? `消息状态：${stateLabel[metadata.state]} · ${metadata.model} · ${metadata.stages.map((s) => `${s.stage === 'summary' ? '摘要' : '问题'}结束原因 ${s.finishReason ?? '未收到'}`).join('；')}` : '';
  const choice = get<HTMLSelectElement>('attempt'); choice.replaceChildren(...items.map((item, i) => new Option(`第${i + 1}次 · ${stateLabel[item.state]}`, String(i)))); choice.value = String(selected); choice.disabled = pending;
  get('attempt-choice').hidden = items.length < 2;
  get<HTMLButtonElement>('download').disabled = pending;
  const showAll = get<HTMLSelectElement>('event-view').value === 'all';
  get('record-label').textContent = `${stateLabel[attempt.state]} · 共${attempt.events.length}个UI事件${showAll ? '' : '，当前隐藏文字增量'}`;
  const rows = get('events'); rows.replaceChildren();
  attempt.events.forEach(({ elapsedMs, event }, i) => {
    if (!showAll && event.type === 'text-delta') return;
    const tr = document.createElement('tr');
    for (const value of [`${i + 1} / ${elapsedMs}`, event.type, eventDescription(event)]) { const td = document.createElement('td'); td.textContent = value; tr.append(td); }
    rows.append(tr);
  });
  // 课堂原始区直接展示历史消息快照和实际停止回执。
  get('raw-record').textContent = JSON.stringify(showingClassroom ? { case: classroomRecord!.cases[selected], http: classroomRecord!.http.filter((item) => item.method === 'POST' && item.path === `/api/streaming/${attempt.id}/stop`) } : attempt, null, 2);
}

get('run').addEventListener('click', async () => {
  if (busy || loadingClassroom || showingClassroom) return;
  const material = get<HTMLTextAreaElement>('material').value;
  if (!material.trim()) { get('status').textContent = '请先输入小说资料。'; return; }
  const attempt: Attempt = { id: crypto.randomUUID(), material, state: 'running', message: null, events: [], serverRecord: null, error: null, snapshots: [], stopRequests: [] };
  attempts.push(attempt); current = attempts.length - 1; busy = true; stopping = false; loadError = ''; render();
  const start = performance.now();
  let finished = false;
  try {
    const transport = new DefaultChatTransport<AssistantMessage>({ api: '/api/streaming/run', prepareSendMessagesRequest: () => ({ body: { runId: attempt.id, material } }) });
    const incoming = await transport.sendMessages({ trigger: 'submit-message', chatId: attempt.id, messageId: undefined, messages: [], abortSignal: undefined });
    const recorded = incoming.pipeThrough(new TransformStream({ transform(chunk, controller) {
      const event = chunk as Chunk;
      // SDK合并同ID片段时可能修改对象，事件历史保存收到时的独立快照。
      attempt.events.push({ elapsedMs: Math.round((performance.now() - start) * 10) / 10, event: structuredClone(event) });
      if (event.type === 'finish') finished = true;
      if (event.type === 'error') { attempt.state = 'failed'; attempt.error = event.errorText; }
      if (event.type === 'abort') { attempt.state = 'stopped'; attempt.error = event.reason || '已停止，任务未完成。'; }
      controller.enqueue(chunk);
    } }));
    // SDK负责按ID合并文字和进度；页面只渲染消息快照，不自行模拟增量。
    for await (const message of readUIMessageStream<AssistantMessage>({ stream: recorded, onError: () => { attempt.state = 'failed'; attempt.error ||= '消息流处理失败，已有文字保留。'; } })) {
      attempt.snapshots.push({ eventCount: attempt.events.length, elapsedMs: Math.round((performance.now() - start) * 10) / 10, message: structuredClone(message) });
      attempt.message = message; render();
    }
    if (attempt.state === 'running') { attempt.state = finished ? 'completed' : 'failed'; if (!finished) attempt.error = '连接结束，但没有收到整条消息完成事件。'; }
  } catch { attempt.state = 'failed'; attempt.error = '连接或消息流中断，已收到的文字保留；没有自动重试。'; }
  finally {
    try { const response = await fetch(`/api/streaming/${attempt.id}/record`); if (response.ok) attempt.serverRecord = await response.json() as RunRecord; } catch { /* 已收到的客户端事件仍可导出。 */ }
    busy = false; stopping = false; render();
  }
});
get('stop').addEventListener('click', async () => {
  const attempt = attempts[current]; if (!busy || !attempt || stopping) return;
  stopping = true; render();
  const receipt = { beganAt: new Date().toISOString(), status: null as number | null, response: null as unknown };
  attempt.stopRequests.push(receipt);
  try {
    const response = await fetch(`/api/streaming/${attempt.id}/stop`, { method: 'POST' });
    receipt.status = response.status; receipt.response = await response.json();
    if (!response.ok) throw new Error();
  } catch { stopping = false; attempt.error = '未能确认停止，请重试停止操作。'; render(); }
});
get('classroom').addEventListener('click', async () => {
  if (busy || loadingClassroom) return;
  loadingClassroom = true; loadError = ''; render();
  try {
    if (!classroomRecord) {
      const response = await fetch('/requests/records/streaming/classroom.json');
      if (!response.ok) throw new Error();
      const record = await response.json() as ClassroomRecord;
      classroomAttempts = record.cases.map((item) => ({ id: item.record.id, state: item.record.state, message: item.finalMessage, events: item.record.uiEvents, error: item.record.error ?? item.error }));
      classroomRecord = record;
    }
    classroomCurrent = 0; showingClassroom = true;
  } catch { loadError = '课堂实录读取失败，请重试。'; }
  finally { loadingClassroom = false; render(); }
});
get('local').addEventListener('click', () => { if (busy || loadingClassroom) return; showingClassroom = false; loadError = ''; render(); });
get('attempt').addEventListener('change', () => { if (busy || loadingClassroom) return; if (showingClassroom) classroomCurrent = Number(get<HTMLSelectElement>('attempt').value); else current = Number(get<HTMLSelectElement>('attempt').value); render(); });
get('event-view').addEventListener('change', render);
get('download').addEventListener('click', () => {
  if (busy || loadingClassroom) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(showingClassroom ? classroomRecord : { attempts }, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = '流式消息-实际事件记录.json'; a.click(); URL.revokeObjectURL(url);
});
function loadInfo() {
  void fetch('/api/streaming/info').then((r) => r.json()).then((info) => { modelLabel = `${info.model} · 完整任务调用两次`; }).catch(() => { modelLabel = '未读取到模型配置'; }).finally(() => { if (!showingClassroom) get('model').textContent = modelLabel; });
}
loadInfo();
window.addEventListener('model-settings-changed', loadInfo);
