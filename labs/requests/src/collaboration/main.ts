import './style.css';
import '../lab.css';
import { markdown } from '../../../../shared/markdown.ts';
import { BACKGROUND, PREVIOUS_CHAPTER, INITIAL_TASK } from './scenario.ts';
import { acceptTurn, type Turn, type CollaborationResponse, type CollaborationResult } from './contract.ts';

const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = `<header><h1>笔记共写</h1><p>粘贴你选择并编辑的完整方案，整理后再根据实际笔记提出修改。</p></header>
  <details><summary>完整前文与首轮任务</summary><section class="facts"><div id="background"></div><div id="previous-chapter"></div><h2>首轮任务</h2><p id="initial-task"></p></section></details>
  <div class="classroom-actions"><button id="classroom" class="secondary" type="button">查看课堂实录</button><button id="local" class="secondary" type="button" hidden>返回本机共写</button><span id="result-source" class="meta" hidden></span></div>
  <p id="status" role="status" aria-live="polite"></p>
  <section id="conversation" hidden><div class="section-heading"><h2>共写记录</h2><button id="copy" class="secondary" type="button">复制最新回答</button></div><div id="turns"></div></section>
  <form id="compose"><label id="input-label" for="input">已选择并编辑的完整方案</label>
    <textarea id="input" rows="7" maxlength="6000" placeholder="粘贴完整方案；你补充的条件与修改也一并写在这里。" required></textarea>
    <div class="compose-actions"><p class="note">每次提交调用模型 1 次。</p><button id="send" type="submit">整理阅读笔记</button></div>
  </form>
  <details id="inspector" hidden><summary>请求明细与用量</summary><div class="inspector-body">
    <div class="record-bar"><button id="download" class="secondary" disabled>下载共写记录</button><span class="note">刷新前下载，保留全部尝试。</span></div>
    <div id="record-choice-wrap"><label for="record-choice">选择尝试 </label><select id="record-choice"></select></div><div id="record-content"></div>
  </div></details>`;

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
element('background').append(markdown(BACKGROUND));
element('previous-chapter').append(markdown(PREVIOUS_CHAPTER));
element('initial-task').textContent = INITIAL_TASK;
const initialPrefix = `${INITIAL_TASK}\n\n人选择并编辑的完整方案：\n`;
element<HTMLTextAreaElement>('input').maxLength = 6000 - initialPrefix.length;
type Attempt = { input: string; priorSuccessfulTurns: number; startedAt: string; result: CollaborationResult | null; transportError: string | null };
const attempts: Attempt[] = [];
let history: Turn[] = [];
let classroomRecord: { successfulHistory: Turn[]; attempts: Attempt[] } | undefined;
let classroomView = false, classroomSelected = -1;
let busy = false;
let selected = -1;

function paragraph(text: string, className = '') {
  const p = document.createElement('p'); p.textContent = text; p.className = className; return p;
}

function setBusy(value: boolean) {
  busy = value;
  for (const id of ['send', 'classroom', 'local']) element<HTMLButtonElement>(id).disabled = value;
  element<HTMLTextAreaElement>('input').disabled = value;
  element<HTMLSelectElement>('record-choice').disabled = value;
  element<HTMLButtonElement>('copy').disabled = value;
  element<HTMLButtonElement>('download').disabled = value || !(classroomView ? classroomRecord?.attempts.length : attempts.length);
}

function renderHistory() {
  const turns = classroomView ? classroomRecord?.successfulHistory ?? [] : history;
  element('conversation').hidden = !turns.length;
  const container = element('turns'); container.replaceChildren();
  for (const [index, turn] of turns.entries()) {
    const latest = index === turns.length - 1;
    const block = document.createElement(latest ? 'section' : 'details');
    block.className = latest ? 'latest-turn' : 'previous-turn';
    const label = document.createElement(latest ? 'h3' : 'summary'); label.textContent = `第 ${index + 1} 轮${latest ? ' · 最新回答' : ''}`;
    const content = document.createElement('div'); content.className = 'turn-body';
    content.append(paragraph('我们的任务或反馈', 'small-label'), paragraph(turn.input, 'human-input'), paragraph('AI 原始回答', 'small-label'), markdown(turn.answer, 'answer'));
    block.append(label, content); container.append(block);
  }
}

function renderInspector() {
  const records = classroomView ? classroomRecord?.attempts ?? [] : attempts;
  element('inspector').hidden = !records.length;
  element('record-choice-wrap').hidden = records.length < 2;
  const select = element<HTMLSelectElement>('record-choice');
  select.replaceChildren(...records.map((attempt, index) => new Option(`尝试 ${index + 1} · 第 ${attempt.priorSuccessfulTurns + 1} 轮`, String(index))));
  select.value = String(classroomView ? classroomSelected : selected);
  const container = element('record-content'); container.replaceChildren();
  const attempt = records[classroomView ? classroomSelected : selected]; if (!attempt) return;
  const message = attempt.transportError || attempt.result?.error?.message || (!attempt.result ? '正在等待本轮结果。' : '');
  if (message) container.append(paragraph(message, attempt.transportError || attempt.result?.error ? 'error' : 'meta'));
  container.append(paragraph(`本次输入：${attempt.input}`, 'human-input'));
  if (!attempt.result) return;
  const request = attempt.result.request;
  if (!request) { container.append(paragraph('未发起模型请求。', 'note')); return; }
  container.append(paragraph(`HTTP ${request.httpStatus ?? '未返回'} · 模型 ${request.responseModel ?? '未返回'} · finish_reason=${request.finishReason ?? '未返回'} · ${request.durationMs ?? '—'} ms`, 'meta'));
  for (const [title, text] of [
    ['实际发送的完整请求体', request.requestBody],
    ['原始响应消息', JSON.stringify(request.responseMessage ?? null, null, 2)],
    ['实际 usage', JSON.stringify(request.usage ?? null, null, 2)],
  ]) {
    const detail = document.createElement('details'); detail.className = 'json';
    const summary = document.createElement('summary'); summary.textContent = title;
    const pre = document.createElement('pre'); pre.textContent = text;
    detail.append(summary, pre); container.append(detail);
  }
}

function renderView() {
  element('compose').hidden = classroomView;
  element('local').hidden = !classroomView;
  element('result-source').hidden = !classroomView && !attempts.length;
  element('result-source').textContent = classroomView ? '课堂实录' : '本机共写';
  renderHistory(); renderInspector(); setBusy(busy);
}

element<HTMLFormElement>('compose').addEventListener('submit', async (event) => {
  event.preventDefault(); if (busy || classroomView) return;
  const input = element<HTMLTextAreaElement>('input'); if (!input.value.trim()) return;
  const requestInput = history.length ? input.value : initialPrefix + input.value;
  const attempt: Attempt = { input: requestInput, priorSuccessfulTurns: history.length, startedAt: new Date().toISOString(), result: null, transportError: null };
  attempts.push(attempt); selected = attempts.length - 1; setBusy(true);
  const status = element('status'); status.className = ''; status.textContent = 'AI 正在根据我们的任务与完整对话继续共写…'; renderView();
  try {
    const response = await fetch('/api/collaboration/turn', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: attempt.input, history }),
    });
    const data = await response.json() as CollaborationResponse | { error: string };
    if (!('result' in data)) throw new Error(data.error);
    attempt.result = data.result;
    if (!data.ok || data.result.error) {
      status.textContent = data.result.error?.message || '本轮没有完成；输入保留，未加入成功对话。'; status.className = 'error';
    } else {
      history = acceptTurn(history, data.result);
      input.value = ''; input.maxLength = 6000; input.placeholder = '指出需要修正的原句、具体改法和本轮要交付的内容。需要替换整稿时，粘贴完整当前稿。';
      element('input-label').textContent = '下一轮反馈'; element('send').textContent = '发送反馈';
      status.textContent = ''; renderHistory();
    }
  } catch (error) {
    attempt.transportError = error instanceof Error ? error.message : '连接未完成。';
    status.textContent = `${attempt.transportError} 输入和已有成功对话保留，没有自动重试。`; status.className = 'error';
  } finally {
    setBusy(false); renderView();
  }
});
element('classroom').addEventListener('click', async () => {
  if (busy) return;
  setBusy(true); const status = element('status'); status.className = ''; status.textContent = '正在读取课堂实录……';
  try {
    if (!classroomRecord) {
      const response = await fetch('/requests/records/collaboration/classroom.json');
      if (!response.ok) throw new Error('classroom-unavailable');
      classroomRecord = await response.json() as { successfulHistory: Turn[]; attempts: Attempt[] };
      classroomSelected = classroomRecord.attempts.length - 1;
    }
    // 课堂只回看原对话，本机下一轮始终使用自己的成功历史。
    classroomView = true; renderView(); status.textContent = '';
  } catch { status.textContent = '课堂实录读取失败，请重试。'; status.className = 'error'; }
  finally { setBusy(false); }
});
element('local').addEventListener('click', () => {
  if (busy) return;
  classroomView = false; element('status').textContent = ''; element('status').className = ''; renderView();
});
element('record-choice').addEventListener('change', () => {
  if (busy) return;
  const value = Number(element<HTMLSelectElement>('record-choice').value);
  if (classroomView) classroomSelected = value; else selected = value;
  renderInspector();
});
element('copy').addEventListener('click', async () => {
  if (busy) return;
  const latest = (classroomView ? classroomRecord?.successfulHistory : history)?.at(-1); if (!latest) return;
  try { await navigator.clipboard.writeText(latest.answer); element('status').className = ''; element('status').textContent = '已复制最新回答。'; }
  catch { element('status').textContent = '浏览器未允许复制，请直接选择回答文字复制。'; }
});
element('download').addEventListener('click', () => {
  const data = { background: BACKGROUND, previousChapter: PREVIOUS_CHAPTER,
    successfulHistory: classroomView ? classroomRecord!.successfulHistory : history,
    attempts: classroomView ? classroomRecord!.attempts : attempts };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = '笔记共写-实际请求记录.json'; link.click(); URL.revokeObjectURL(url);
});
