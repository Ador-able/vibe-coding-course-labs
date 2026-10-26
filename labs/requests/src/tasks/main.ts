import '../lab.css';
import './style.css';
import { renderMarkdown } from '../../../../shared/markdown.ts';
import { FEEDBACK_CRITERION, LESSONS, METHOD_NAMES, PLAN, type Lesson, type TaskRun, type Criterion, type Judgment } from './contract.ts';
import { assessRun } from './checks.ts';

const lesson = location.pathname.split('/')[2].replace('task-', '') as Lesson;
const definition = LESSONS[lesson];
const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = `<header><h1></h1><p></p></header>
  <details id="materials"><summary>本节输入与判断条件</summary><div class="guide-body" id="material-body"></div></details>
  <section class="task-controls"><button id="run" disabled></button><button id="stop" class="secondary" hidden>停止</button><button id="classroom" class="secondary" disabled>查看课堂实录</button><span class="note" id="call-count"></span></section>
  <p id="status" role="status" aria-live="polite"></p>
  <section id="results" hidden><div class="record-bar"><span id="record-source" hidden></span><label id="record-picker">查看记录 <select id="history"></select></label></div>
  <div id="drafts"></div></section>`;
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
app.querySelector('h1')!.textContent = `${definition.name}实验`;
app.querySelector('header p')!.textContent = definition.description;
const start = get<HTMLButtonElement>('run'), stop = get<HTMLButtonElement>('stop'), classroom = get<HTMLButtonElement>('classroom');
start.textContent = definition.action;
get('call-count').textContent = `本轮最多调用 ${PLAN[lesson].length} 次`;
const history = get<HTMLSelectElement>('history');
let runs: TaskRun[] = [], batchId = '', controller: AbortController | undefined;
let criteria: Record<string, Criterion[]>;
const status = (text: string) => { get('status').textContent = text; };
const conditionName = (method: TaskRun['method']) => lesson === 'feedback' ? '表达反馈' : lesson === 'goals' ? '完整任务' : METHOD_NAMES[method];
async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/tasks/' + path, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求没有完成，请检查本机服务。');
  return data as T;
}
function addMaterial(title: string, content: string) {
  const detail = document.createElement('details'), summary = document.createElement('summary'), body = document.createElement('div');
  summary.textContent = title; body.className = 'task-material'; renderMarkdown(body, content);
  detail.append(summary, body); get('material-body').append(detail);
}
function renderBatch() {
  const current = runs.filter(run => run.batchId === batchId).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  get('results').hidden = !current.length;
  const drafts = get('drafts');
  // 保留已显示章稿的填写状态，新返回的对照结果依次追加。
  const existing = new Map([...drafts.querySelectorAll<HTMLElement>(':scope > section')].map(section => [section.dataset.runId, section]));
  drafts.replaceChildren(...current.map((run, index) => {
    let section = existing.get(run.id);
    if (!section) { section = document.createElement('section'); section.className = 'task-draft'; section.dataset.runId = run.id; showRun(run, section); }
    const heading = section.querySelector('h2')!; heading.hidden = current.length === 1;
    heading.textContent = `${run.archive && lesson === 'examples' ? `第 ${index + 1} 次 · ` : ''}${run.caseId} / ${conditionName(run.method)}${lesson === 'evaluation' ? run.caseId === 'S1' ? ' · 开发' : ' · 另留复查' : ''}`;
    return section;
  }));
}
function showRun(run: TaskRun, section: HTMLElement) {
  section.innerHTML = `<h2></h2><div class="markdown-body task-answer"></div>
    <details class="task-review"><summary>按原句与资料核对</summary><p class="judgment-reason"></p><form class="review-form"></form></details>
    <details><summary class="request-title">实际请求与返回</summary><pre class="request"></pre></details>`;
  const find = <T extends HTMLElement>(selector: string) => section.querySelector<T>(selector)!;
  renderMarkdown(find('.task-answer'), run.output || '本次没有取得正文。');
  const requirements = [...criteria[run.caseId], ...(lesson === 'feedback' ? [FEEDBACK_CRITERION] : [])];
  const updateAssessment = (record: TaskRun) => {
    const assessment = assessRun(record, requirements);
    find('.judgment-reason').textContent = `${assessment.label}：${assessment.reason}`;
  };
  updateAssessment(run);
  find('.request-title').textContent = run.archive ? '实际输入与运行报告' : '实际请求与返回';
  find('.request').textContent = JSON.stringify(run.archive ? { input: run.request.requestBody, output: run.output, judgments: run.judgments, ...run.archive } : run, null, 2);
  const form = find<HTMLFormElement>('.review-form'); form.hidden = run.state !== 'completed';
  if (form.hidden) return;
  const fields: { id: string; select: HTMLSelectElement; evidence: HTMLTextAreaElement }[] = [];
  for (const item of requirements) {
    const label = document.createElement('label'), text = document.createElement('span'), select = document.createElement('select');
    text.textContent = item.text;
    select.setAttribute('aria-label', item.text + ' 判断'); select.append(new Option('待核', 'pending'), new Option('符合', 'pass'), new Option('不符合', 'fail'));
    select.value = run.judgments[item.id]?.decision ?? 'pending';
    select.disabled = !!run.archive;
    label.append(text, select);
    const evidence = document.createElement('textarea'); evidence.rows = 2; evidence.maxLength = 3000; evidence.placeholder = '实际原句、对应资料位置与判断依据'; evidence.setAttribute('aria-label', item.text + ' 依据'); evidence.value = run.judgments[item.id]?.evidence ?? ''; evidence.readOnly = !!run.archive;
    label.append(evidence); fields.push({ id: item.id, select, evidence });
    form.append(label);
  }
  if (run.archive) return;
  const save = document.createElement('button'); save.type = 'submit'; save.className = 'secondary'; save.textContent = '保存本轮核对';
  const feedback = document.createElement('p'); feedback.className = 'save-feedback'; feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite'); form.append(save, feedback);
  form.onsubmit = async event => {
    event.preventDefault(); save.disabled = true; save.textContent = '正在保存…'; feedback.textContent = '';
    fields.forEach(field => { field.select.disabled = true; field.evidence.disabled = true; });
    try {
      const judgments = Object.fromEntries(fields.map(field => [field.id, { decision: field.select.value as Judgment['decision'], evidence: field.evidence.value }]));
      const updated = await json<TaskRun>(`runs/${run.id}/judgments`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(judgments) });
      runs = runs.map(item => item.id === updated.id ? updated : item);
      updateAssessment(updated); find('.request').textContent = JSON.stringify(updated, null, 2); feedback.textContent = '核对已保存。';
    } catch (error) { feedback.textContent = '核对未保存：' + (error as Error).message; }
    finally { save.disabled = false; save.textContent = '保存本轮核对'; fields.forEach(field => { field.select.disabled = false; field.evidence.disabled = false; }); }
  };
}
function renderHistory() {
  const batches = [...new Map(runs.map(run => [run.batchId, run])).values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  let localNumber = 0;
  const options = batches.map(run => new Option(run.archive ? '课堂实录' : `运行 ${++localNumber}`, run.batchId));
  history.replaceChildren(...options.reverse());
  if (!batches.some(run => run.batchId === batchId)) batchId = batches.at(-1)?.batchId ?? '';
  history.value = batchId;
  get('record-picker').hidden = batches.length < 2;
  get('record-source').hidden = batches.length !== 1;
  get('record-source').textContent = history.selectedOptions[0]?.textContent ?? '';
  renderBatch();
}
history.onchange = () => { batchId = history.value; renderBatch(); status(''); };
stop.onclick = () => controller?.abort();
classroom.onclick = async () => {
  classroom.disabled = true; start.disabled = true; history.disabled = true; status('正在读取课堂实录…');
  try {
    const records = await json<TaskRun[]>(`classroom/${lesson}`);
    runs = [...runs.filter(run => !run.archive), ...records];
    batchId = records[0]?.batchId ?? ''; renderHistory(); status('');
  } catch (error) { status((error as Error).message); }
  finally { classroom.disabled = false; start.disabled = false; history.disabled = false; }
};
start.onclick = async () => {
  controller = new AbortController(); start.disabled = true; stop.hidden = false; history.disabled = true; classroom.disabled = true;
  batchId = crypto.randomUUID();
  try {
    for (const [index, item] of PLAN[lesson].entries()) {
      if (controller.signal.aborted) break;
      const beganAt = Date.now();
      const progress = () => status(`正在请求 ${index + 1}/${PLAN[lesson].length}：${item.caseId} / ${conditionName(item.method)}，已等待 ${Math.floor((Date.now() - beganAt) / 1000)} 秒…`);
      progress(); app.setAttribute('aria-busy', 'true'); const timer = window.setInterval(progress, 1000);
      let run: TaskRun;
      try { run = await json<TaskRun>('run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ lesson, ...item, batchId }) }); }
      finally { clearInterval(timer); app.removeAttribute('aria-busy'); }
      runs.unshift(run);
      renderHistory();
      if (index === PLAN[lesson].length - 1) status(run.state === 'failed' ? run.error || '本次调用未完成。' : '');
    }
  } catch (error) { status(controller.signal.aborted ? '已停止后续调用。本次已取得的记录保留，刷新页面可回查。' : (error as Error).message); }
  finally { controller = undefined; start.disabled = false; stop.hidden = true; history.disabled = false; classroom.disabled = false; }
};
void (async () => {
  try {
    const materials = await json<{ tasks: Record<string, string>; conflict: string; consistent: string; feedback: string; original: string; preflight: string; criteria: Record<string, Criterion[]> }>('materials');
    criteria = materials.criteria;
    for (const id of [...new Set(PLAN[lesson].map(item => item.caseId))]) addMaterial(`完整任务 ${id}`, materials.tasks[id]);
    if (lesson === 'examples') { addMaterial('冲突样例', materials.conflict); addMaterial('相容样例', materials.consistent); }
    if (lesson === 'feedback') { addMaterial('本轮反馈', materials.feedback); addMaterial('历史真实原稿', materials.original); }
    if (lesson === 'evaluation') addMaterial('B：追加的事前核对要求', materials.preflight);
    addMaterial('人工判断条件', [...new Set(PLAN[lesson].map(item => item.caseId))].map(id => '### ' + id + '\n\n' + [...criteria[id], ...(lesson === 'feedback' ? [FEEDBACK_CRITERION] : [])].map(item => '- ' + item.text).join('\n')).join('\n\n'));
    runs = (await json<TaskRun[]>('runs')).filter(run => run.lesson === lesson); renderHistory(); start.disabled = false; classroom.disabled = false;
  } catch (error) { status('实验资料未能载入：' + (error as Error).message); }
})();
