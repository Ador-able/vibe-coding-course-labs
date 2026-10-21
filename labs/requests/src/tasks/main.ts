import '../lab.css';
import './style.css';
import { renderMarkdown } from '../../../../shared/markdown.ts';
import { LESSONS, METHOD_NAMES, PLAN, type Lesson, type TaskRun, type Criterion, type Judgment } from './contract.ts';
import { totals } from './checks.ts';

const lesson = location.pathname.split('/')[2].replace('task-', '') as Lesson;
const definition = LESSONS[lesson];
const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = `<header><h1></h1><p></p></header>
  <details id="materials"><summary>本节输入与判断条件</summary><div class="guide-body" id="material-body"></div></details>
  <details><summary>调用设置</summary><label>推理档位 <select id="effort"><option value="">沿用服务默认</option><option value="low">low</option><option value="high">high</option><option value="max">max</option></select></label><p class="note">仅在接口支持时选择。推理可能占用输出额度；本轮各组使用同一设置，实际参数随请求保存。</p></details>
  <section class="task-controls"><button id="run" disabled></button><button id="stop" class="secondary" hidden>停止</button><a id="classroom" target="_blank" rel="noopener">查看课堂实录</a><span class="note" id="call-count"></span></section>
  <p id="status" role="status" aria-live="polite"></p>
  <section id="results" hidden><div class="record-bar"><label>本机运行 <select id="history"></select></label><button id="export" class="link-button">导出本轮记录</button></div>
  <div id="comparison" class="table-scroll"></div><label class="task-record-picker">查看章稿 <select id="selected-run"></select></label>
  <div id="answer" class="markdown-body task-answer"></div><p id="automated" class="note"></p>
  <details id="review"><summary>按原句与资料核对</summary><form id="review-form"></form></details>
  <details><summary>实际请求与返回</summary><pre id="request"></pre></details></section>`;
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
app.querySelector('h1')!.textContent = `${definition.name}实验`;
app.querySelector('header p')!.textContent = definition.description;
const start = get<HTMLButtonElement>('run'), stop = get<HTMLButtonElement>('stop');
start.textContent = definition.action;
get<HTMLAnchorElement>('classroom').href = '/requests/tasks/classroom/' + ({ goals: '任务验收', examples: '样例对照', feedback: '局部反馈', evaluation: '评估样本', cost: '成本比较' }[lesson]) + '实录.html';
get('call-count').textContent = `本轮最多调用 ${PLAN[lesson].length} 次`;
const history = get<HTMLSelectElement>('history'), picker = get<HTMLSelectElement>('selected-run');
const effort = get<HTMLSelectElement>('effort');
try { effort.value = localStorage.getItem('task-reasoning-effort') || ''; } catch { /* 浏览器未提供本机偏好存储时，沿用服务默认。 */ }
effort.onchange = () => { try { localStorage.setItem('task-reasoning-effort', effort.value); } catch { /* 本轮仍使用当前选择。 */ } };
let runs: TaskRun[] = [], selected: TaskRun | undefined, batchId = '', controller: AbortController | undefined;
let criteria: Record<string, Criterion[]>;
const status = (text: string) => { get('status').textContent = text; };
const conditionName = (method: TaskRun['method']) => lesson === 'feedback' ? '指定句反馈' : lesson === 'goals' ? '完整任务' : lesson === 'cost' ? method === 'A' ? '初稿' : '增加核对' : METHOD_NAMES[method];
async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/tasks/' + path, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求没有完成，请检查本机服务。');
  return data as T;
}
function addMaterial(title: string, content: string) {
  const detail = document.createElement('details'), summary = document.createElement('summary'), pre = document.createElement('pre');
  summary.textContent = title; pre.textContent = content; detail.append(summary, pre); get('material-body').append(detail);
}
function verdict(run: TaskRun) {
  if (run.state !== 'completed') return run.state === 'failed' ? '调用失败' : '调用中或被中断，尚无完成记录';
  if (!run.checks.lengthPass || run.checks.exactEdit === false || Object.entries(run.judgments).some(([key, item]) => key !== 'scope' && item.decision === 'fail')) return '不符合';
  return criteria[run.caseId].every(item => run.judgments[item.id]?.decision === 'pass') ? '符合本轮章稿条件' : '待核';
}
function table(headers: string[], rows: string[][]) {
  const el = document.createElement('table'), head = el.createTHead().insertRow();
  headers.forEach(text => { const cell = document.createElement('th'); cell.textContent = text; head.append(cell); });
  const body = el.createTBody(); rows.forEach(row => { const tr = body.insertRow(); row.forEach(text => { tr.insertCell().textContent = text; }); });
  return el;
}
const number = (value: number | null) => value === null ? '未知' : value.toLocaleString('zh-CN');
function renderBatch() {
  const current = runs.filter(run => run.batchId === batchId).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  get('results').hidden = !current.length;
  picker.replaceChildren(...current.map(run => new Option(`${run.caseId} / ${conditionName(run.method)} · ${verdict(run)}`, run.id)));
  const comparison = get('comparison'); comparison.replaceChildren();
  if (lesson === 'cost') {
    const a = current.find(run => run.method === 'A'), b = current.find(run => run.method === 'B');
    const rows = (a ? [{ label: 'A：保留初稿', records: [a] }, ...(b ? [{ label: 'B：同一初稿 + 核对', records: [a, b] }] : [])] : []).map(path => {
      const sum = totals(path.records), final = path.records.at(-1)!;
      return [path.label, verdict(final), path.records.length === 1 ? '—' : ({ pass: '符合', fail: '不符合', pending: '待核' }[final.judgments.scope?.decision ?? 'pending']), String(sum.calls), sum.durationMs === null ? '未知' : (sum.durationMs / 1000).toFixed(2), number(sum.input), number(sum.output)];
    });
    comparison.append(table(['路径', '章稿判断', '核对范围', '调用数', '累计秒', '输入 token', '输出 token'], rows));
    if (a && !b) { const pending = document.createElement('p'); pending.className = 'note'; pending.textContent = a.state === 'failed' ? '初稿调用失败，B 已跳过核对；这次初稿的等待和用量仍计入本轮。' : '这一对尚无核对结果，目前只记录了初稿阶段的消耗。'; comparison.append(pending); }
    const note = document.createElement('p'); note.className = 'note'; note.textContent = 'B 包含 A 的同一次初稿。整轮实际调用按唯一编号计数；缓存和推理细分见原始用量。金额与人工工时未测。'; comparison.append(note);
  } else {
    comparison.append(table(['样本 / 条件', '正文汉字', '章稿判断', '返回型号'], current.map(run => [run.caseId + ' / ' + conditionName(run.method) + (lesson === 'evaluation' ? run.caseId === 'S1' ? ' · 开发' : ' · 另留复查' : ''), run.state === 'completed' ? String(run.checks.hanCount) : '—', verdict(run), run.request.responseModel || '未报告'])));
  }
  showRun(current.find(run => run.id === selected?.id) ?? current[0]);
}
function showRun(run?: TaskRun) {
  selected = run; if (!run) return;
  picker.value = run.id;
  renderMarkdown(get('answer'), run.output || '本次没有取得正文。');
  get('automated').textContent = run.state !== 'completed' ? `${run.error || '本次没有完成记录。'} 已取得的返回与用量可在下方回查，本次不作章稿判断。` : `正文 ${run.checks.hanCount} 个汉字（去掉首行标题，排除标点及非汉字），${run.checks.lengthPass ? '符合' : '不符合'} 800—1200 字。` + (run.checks.exactEdit === undefined ? '' : run.checks.exactEdit ? '全文与“原稿只替换指定句”的结果完全相同。' : '全文与“原稿只替换指定句”的结果不同，需要检查其余变化。');
  get('request').textContent = JSON.stringify(run, null, 2);
  const form = get<HTMLFormElement>('review-form'); form.replaceChildren();
  const items = [...criteria[run.caseId], ...(lesson === 'cost' && run.method === 'B' ? [{ id: 'scope', text: '核对步骤只修正不符之处，保留已经相容的描写与完整正文。' }] : [])];
  const fields = items.map(item => {
    const label = document.createElement('label'), text = document.createElement('span'), select = document.createElement('select'), evidence = document.createElement('textarea');
    text.textContent = item.text;
    select.setAttribute('aria-label', item.text + ' 判断'); select.append(new Option('待核', 'pending'), new Option('符合', 'pass'), new Option('不符合', 'fail'));
    select.value = run.judgments[item.id]?.decision ?? 'pending';
    evidence.rows = 2; evidence.maxLength = 3000; evidence.placeholder = '实际原句、对应资料位置与判断依据'; evidence.setAttribute('aria-label', item.text + ' 依据'); evidence.value = run.judgments[item.id]?.evidence ?? '';
    label.append(text, select, evidence); form.append(label); return { id: item.id, select, evidence };
  });
  const save = document.createElement('button'); save.className = 'secondary'; save.textContent = '保存本轮核对'; form.append(save);
  form.onsubmit = async event => {
    event.preventDefault(); save.disabled = true;
    try {
      const judgments = Object.fromEntries(fields.map(field => [field.id, { decision: field.select.value as Judgment['decision'], evidence: field.evidence.value }]));
      const updated = await json<TaskRun>(`runs/${run.id}/judgments`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(judgments) });
      runs = runs.map(item => item.id === updated.id ? updated : item); renderBatch(); status('核对已保存。');
    } catch (error) { status((error as Error).message); } finally { save.disabled = false; }
  };
}
function renderHistory() {
  const batches = [...new Map(runs.map(run => [run.batchId, run])).values()];
  history.replaceChildren(...batches.map(run => new Option(new Date(run.startedAt).toLocaleString('zh-CN'), run.batchId)));
  if (!batches.some(run => run.batchId === batchId)) batchId = batches[0]?.batchId ?? '';
  history.value = batchId; renderBatch();
}
history.onchange = () => { selected = undefined; batchId = history.value; renderBatch(); };
picker.onchange = () => showRun(runs.find(run => run.id === picker.value));
stop.onclick = () => controller?.abort();
start.onclick = async () => {
  controller = new AbortController(); start.disabled = true; stop.hidden = false; history.disabled = true; effort.disabled = true;
  selected = undefined; batchId = crypto.randomUUID(); let parent: TaskRun | undefined;
  try {
    for (const [index, item] of PLAN[lesson].entries()) {
      if (controller.signal.aborted) break;
      if (lesson === 'cost' && item.method === 'B' && parent?.state !== 'completed') { status('初稿未完成，已跳过核对；已发生的调用保留。'); break; }
      const beganAt = Date.now();
      const progress = () => status(`正在请求 ${index + 1}/${PLAN[lesson].length}：${item.caseId} / ${conditionName(item.method)}，已等待 ${Math.floor((Date.now() - beganAt) / 1000)} 秒…`);
      progress(); app.setAttribute('aria-busy', 'true'); const timer = window.setInterval(progress, 1000);
      let run: TaskRun;
      try { run = await json<TaskRun>('run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ lesson, ...item, batchId, ...(effort.value ? { effort: effort.value } : {}), ...(parent ? { parentId: parent.id } : {}) }) }); }
      finally { clearInterval(timer); app.removeAttribute('aria-busy'); }
      runs.unshift(run); if (lesson === 'cost' && item.method === 'A') parent = run;
      renderHistory();
      if (index === PLAN[lesson].length - 1) status('本轮调用结束，请按实际章稿核对；失败和未判断的结果也已保留。');
    }
  } catch (error) { status(controller.signal.aborted ? '已停止后续调用。本次已取得的记录保留，刷新页面可回查。' : (error as Error).message); }
  finally { controller = undefined; start.disabled = false; stop.hidden = true; history.disabled = false; effort.disabled = false; }
};
get('export').onclick = () => {
  const blob = new Blob([JSON.stringify(runs.filter(run => run.batchId === batchId), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `${lesson}-${batchId}.json`; a.click(); URL.revokeObjectURL(url);
};
void (async () => {
  try {
    const materials = await json<{ tasks: Record<string, string>; conflict: string; consistent: string; feedback: string; original: string; preflight: string; review: string; criteria: Record<string, Criterion[]> }>('materials');
    criteria = materials.criteria;
    for (const id of [...new Set(PLAN[lesson].map(item => item.caseId))]) addMaterial(`完整任务 ${id}`, materials.tasks[id]);
    if (lesson === 'examples') { addMaterial('冲突样例', materials.conflict); addMaterial('相容样例', materials.consistent); }
    if (lesson === 'feedback') { addMaterial('本轮反馈', materials.feedback); addMaterial('历史真实原稿', materials.original); }
    if (lesson === 'evaluation') addMaterial('B：追加的事前核对要求', materials.preflight);
    if (lesson === 'cost') addMaterial('B：追加的核对要求', materials.review);
    addMaterial('人工判断条件', [...new Set(PLAN[lesson].map(item => item.caseId))].map(id => id + '\n' + criteria[id].map(item => '• ' + item.text).join('\n')).join('\n\n'));
    runs = (await json<TaskRun[]>('runs')).filter(run => run.lesson === lesson); renderHistory(); start.disabled = false;
  } catch (error) { status('实验资料未能载入：' + (error as Error).message); }
})();
