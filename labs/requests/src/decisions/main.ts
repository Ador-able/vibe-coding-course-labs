import './style.css';
import '../lab.css';
import { markdown, renderMarkdown } from '../../../../shared/markdown.ts';
import { BACKGROUND, PREVIOUS_CHAPTER, GOAL } from './scenario.ts';
import { chooseOption, clearSelection, editDraft, emptyDecision, type Decision, type DecisionRun, type DecisionResponse, type OptionIndex } from './contract.ts';

const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = `<header><h1>选择摘要重点</h1><p>同一段原文，两份短摘要。先比较事情经过与考核条件，再选择和修改。</p></header>
  <div class="generate-bar"><button id="generate">生成两份阅读方案</button><button id="classroom" class="secondary">查看课堂实录</button><p class="note">调用模型 1 次。</p></div>
  <details><summary>完整前文与本轮任务</summary><section class="common"><div><h2>背景与边界</h2><div id="background"></div></div><div><h2>本轮任务</h2><p id="goal"></p></div></section><div id="previous-chapter" class="previous-chapter"></div></details>
  <p id="status" role="status" aria-live="polite"></p>
  <div id="run-picker" hidden><span id="record-source"></span><label id="run-choice-wrap" for="run-choice">查看本页记录 <select id="run-choice"></select></label></div>
  <section id="comparison" hidden><div class="section-heading"><h2>两份完整方案</h2><button id="reject" class="secondary">两份都不采用</button></div>
    <p class="note">理由、取舍和待确认项均为模型建议，需自行核对。</p><div id="options" class="options"></div>
    <p id="decision-state" class="decision-state" role="status"></p>
  </section>
  <section id="editor" hidden><div class="section-heading"><h2>本地待编辑稿</h2><button id="clear" class="secondary">放弃当前选择</button></div>
    <p class="note">修改只保存在本页，不调用模型或对外发布。</p>
    <label for="draft-title">标题</label><input id="draft-title" type="text" />
    <label for="draft-text">完整阅读方案</label><textarea id="draft-text" rows="12"></textarea>
  </section>
  <details id="inspector" hidden><summary>请求明细与用量</summary><div class="inspector-body"><div class="export-bar"><button id="download" class="secondary" disabled>导出本次判断记录</button><span class="note">刷新前导出，保留尝试、选择和编辑稿。</span></div><div id="request-content"></div></div></details>`;

const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
renderMarkdown(get('background'), BACKGROUND);
renderMarkdown(get('previous-chapter'), PREVIOUS_CHAPTER);
get('goal').textContent = GOAL;
type Work = { source: 'local' | 'classroom'; run: DecisionRun | null; transportError: string | null; decision: Decision };
const works: Work[] = [];
let current = -1;
let busy = false;
const paragraph = (text: string, className = '') => { const p = document.createElement('p'); p.textContent = text; p.className = className; return p; };

function setBusy(value: boolean) {
  busy = value;
  for (const id of ['generate', 'classroom', 'reject', 'clear']) get<HTMLButtonElement>(id).disabled = value;
  get<HTMLSelectElement>('run-choice').disabled = value;
  get<HTMLButtonElement>('download').disabled = value || !works.length;
  get<HTMLInputElement>('draft-title').disabled = value; get<HTMLTextAreaElement>('draft-text').disabled = value;
  get('options').querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = value; });
}

function renderDecision() {
  const decision = works[current]?.decision;
  if (!decision) return;
  const editing = decision.status === 'editing' && decision.selected !== null;
  get('editor').hidden = !editing;
  get('decision-state').textContent = editing ? `已选择${works[current].run!.options![decision.selected!].direction}作为基础，当前为本地待编辑稿。`
    : decision.status === 'rejected' ? '两份都不采用。模型原稿和本页已有编辑仍保留。' : '尚未选择。可以选一份作为基础，也可以两份都不采用。';
  for (const button of get('options').querySelectorAll<HTMLButtonElement>('button')) button.setAttribute('aria-pressed', String(editing && Number(button.dataset.option) === decision.selected));
  if (editing) {
    const draft = decision.drafts[decision.selected!]!;
    get<HTMLInputElement>('draft-title').value = draft.title; get<HTMLTextAreaElement>('draft-text').value = draft.text;
  }
}

function render() {
  const work = works[current];
  const error = work?.transportError || work?.run?.error?.message;
  const status = get('status');
  status.className = !busy && error ? 'error' : '';
  if (!busy) status.textContent = error || '';
  get('run-picker').hidden = !works.length;
  const sourceLabel = (item: Work, index: number) => item.source === 'classroom' ? '课堂实录' : `本机运行 ${works.slice(0, index + 1).filter(item => item.source === 'local').length}`;
  const select = get<HTMLSelectElement>('run-choice'); select.replaceChildren(...works.map((item, index) => new Option(`${sourceLabel(item, index)}${item.run?.error || item.transportError ? ' · 未完成' : ''}`, String(index))));
  select.value = String(current); select.disabled = busy;
  get('run-choice-wrap').hidden = works.length < 2; get('record-source').hidden = works.length > 1;
  get('record-source').textContent = work ? sourceLabel(work, current) : '';
  get('inspector').hidden = !work;
  get('comparison').hidden = !work?.run?.options; get('editor').hidden = true;
  const options = get('options'); options.replaceChildren();
  if (work?.run?.options) {
    for (const [index, option] of work.run.options.entries()) {
      const section = document.createElement('section'); section.className = 'option';
      const heading = document.createElement('h3'); heading.textContent = option.direction;
      section.append(heading, markdown(option.text, 'copy'));
      const list = document.createElement('dl');
      for (const [label, text] of [['采用理由', option.reason], ['取舍', option.tradeoff], ['待确认', option.unknowns]]) {
        const term = document.createElement('dt'); term.textContent = label;
        const description = document.createElement('dd'); renderMarkdown(description, text); list.append(term, description);
      }
      const button = document.createElement('button'); button.textContent = '以这版为基础'; button.dataset.option = String(index); button.disabled = busy;
      section.append(list, button); options.append(section);
    }
    renderDecision();
  }
  const content = get('request-content'); content.replaceChildren();
  if (!work) return;
  if (work.transportError || work.run?.error) content.append(paragraph(work.transportError || work.run!.error!.message, 'error'));
  const request = work.run?.request;
  if (request) {
    content.append(paragraph(`HTTP ${request.httpStatus ?? '未返回'} · 模型 ${request.responseModel ?? '未返回'} · finish_reason=${request.finishReason ?? '未返回'}`, 'meta'));
    for (const [label, text] of [['实际请求体', request.requestBody], ['原始响应消息', JSON.stringify(request.responseMessage ?? null, null, 2)], ['实际 usage', JSON.stringify(request.usage ?? null, null, 2)]]) {
      const detail = document.createElement('details'); detail.className = 'json';
      const summary = document.createElement('summary'); summary.textContent = label;
      const pre = document.createElement('pre'); pre.textContent = text; detail.append(summary, pre); content.append(detail);
    }
  } else content.append(paragraph(busy ? '正在等待模型。' : '没有取得实际请求记录。', 'note'));
}

get('generate').addEventListener('click', async () => {
  if (busy) return;
  setBusy(true); const work: Work = { source: 'local', run: null, transportError: null, decision: emptyDecision() }; works.push(work); current = works.length - 1;
  get('status').textContent = '正在根据完整前文生成两份阅读方案…';
  render();
  try {
    const response = await fetch('/api/decisions/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await response.json() as DecisionResponse;
    if (!data.run) throw new Error('没有收到可读取的实验记录。');
    work.run = data.run;
  } catch (error) {
    work.transportError = error instanceof Error ? error.message : '本机连接中断，没有自动重试。';
  } finally {
    setBusy(false); get('generate').textContent = '再生成两份方案'; get('generate').className = 'secondary'; render();
  }
});
get('classroom').addEventListener('click', async () => {
  if (busy) return;
  setBusy(true); const status = get('status'); status.className = ''; status.textContent = '正在读取课堂实录……';
  try {
    let index = works.findIndex(work => work.source === 'classroom');
    if (index < 0) {
      const response = await fetch('/requests/records/decisions/classroom.json');
      if (!response.ok) throw new Error('课堂实录读取失败，请重试。');
      const record = await response.json() as { runs: Omit<Work, 'source'>[] };
      const item = record.runs[0]; index = works.length;
      works.push({ source: 'classroom', run: item.run, transportError: item.transportError, decision: item.decision });
    }
    current = index; render(); status.textContent = '';
  } catch { status.textContent = '课堂实录读取失败，请重试。'; status.className = 'error'; }
  finally { setBusy(false); }
});
get('options').addEventListener('click', (event) => {
  if (busy) return;
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-option]');
  const work = works[current]; if (!button || !work?.run?.options) return;
  work.decision = chooseOption(work.decision, work.run.options, Number(button.dataset.option) as OptionIndex); renderDecision();
});
get('reject').addEventListener('click', () => { if (busy) return; const work = works[current]; work.decision = clearSelection(work.decision, true); renderDecision(); });
get('clear').addEventListener('click', () => { if (busy) return; const work = works[current]; work.decision = clearSelection(work.decision, false); renderDecision(); });
for (const [id, field] of [['draft-title', 'title'], ['draft-text', 'text']] as const) get(id).addEventListener('input', () => {
  if (busy) return;
  const work = works[current]; work.decision = editDraft(work.decision, field, get<HTMLInputElement | HTMLTextAreaElement>(id).value);
});
get('run-choice').addEventListener('change', () => { if (busy) return; current = Number(get<HTMLSelectElement>('run-choice').value); render(); });
get('download').addEventListener('click', () => {
  const payload = { background: BACKGROUND, previousChapter: PREVIOUS_CHAPTER, goal: GOAL, currentRun: current, runs: works.map(({ run, transportError, decision }) => ({ run, transportError, decision,
    currentDraft: decision.selected === null ? null : decision.drafts[decision.selected] })) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = '阅读方案-实际请求与编辑记录.json'; link.click(); URL.revokeObjectURL(url);
});
