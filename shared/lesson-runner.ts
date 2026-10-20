import { lessonActions } from './lesson-actions.ts';
import { renderMarkdown } from './markdown.ts';

const chapter = location.pathname.split('/')[2], actions = lessonActions[chapter];
if (location.pathname.startsWith('/lessons/') && actions) {
  const panel = document.createElement('section'); panel.className = 'lesson-runner';
  panel.innerHTML = `<div class="lesson-run-controls"><label>实验条件 <select aria-label="实验条件"></select></label><button type="button">运行实验</button><button type="button" class="secondary" hidden>停止</button></div><p class="lesson-run-note"></p><p role="status"></p><div class="lesson-run-results"></div><details hidden><summary>运行记录</summary><pre></pre><ul></ul></details>`;
  const [start, stop] = panel.querySelectorAll('button'), select = panel.querySelector('select')!, note = panel.querySelector('.lesson-run-note')!, status = panel.querySelector('[role="status"]')!, results = panel.querySelector('.lesson-run-results')!, details = panel.querySelector('details')!, log = panel.querySelector('pre')!, files = panel.querySelector('ul')!;
  actions.forEach(action => select.add(new Option(action.label, action.id)));
  const defaults: Record<string, string> = { classification: 'labels-v1', extraction: 'extract', templates: 'templates' };
  if (chapter === 'chapter13' && defaults[document.body.dataset.page || '']) select.value = defaults[document.body.dataset.page!];
  const hint = () => { const runtime = actions.find(action => action.id === select.value)!.runtime; note.textContent = runtime === 'local' ? '本次运行不调用模型。' : runtime === 'codex' ? '沿用本机 Codex 登录与模型设置，会产生实际模型用量。' : '沿用共用模型设置，会产生实际模型用量。'; };
  select.addEventListener('change', hint); hint();
  const main = document.querySelector('main')!, anchor = main.querySelector('h1 + p') || main.querySelector('h1');
  if (anchor) anchor.after(panel); else main.prepend(panel);
  let id: string | undefined, timer: ReturnType<typeof setTimeout>, rendered: string | undefined;
  type Run = { id: string; action: string; state: string; log: string; error?: string; files: { name: string; url: string }[] };
  const states: Record<string, string> = { running: '运行中', stopping: '正在停止', completed: '已完成', failed: '未完成', stopped: '已停止，已保存的文件仍保留' };
  async function show(run: Run) {
    id = run.id; const busy = ['running', 'stopping'].includes(run.state);
    start.disabled = busy; select.disabled = busy; stop.hidden = !busy; stop.disabled = run.state === 'stopping';
    status.textContent = `${states[run.state]}${run.error ? `：${run.error}` : ''}`;
    details.hidden = false; log.textContent = run.log;
    if (busy) { timer = setTimeout(poll, 1000); return; }
    if (rendered === run.id) return; rendered = run.id; results.replaceChildren(); files.replaceChildren();
    const answers = run.files.filter(file => /(?:output|final-response|all-agent-messages|answer)\.(?:txt|md)$/.test(file.name));
    for (const file of answers) {
      const response = await fetch(file.url); if (!response.ok) throw new Error('回答未能读回，请展开运行记录。');
      const names: Record<string, string> = { tiered: '按需读取', full: '提供全文', compress: '本次生成的摘要', summary: '只提供本次摘要' };
      const heading = document.createElement('h3'); heading.textContent = names[file.name.split('/').at(-2)!] || '实际回答';
      const text = document.createElement('div'); text.className = 'lesson-run-answer'; renderMarkdown(text, await response.text()); results.append(heading, text);
    }
    if (!answers.length) {
      for (const file of run.files.filter(file => /(?:^|\/)report\.json$/.test(file.name))) {
        const response = await fetch(file.url); if (!response.ok) continue;
        const report = await response.json();
        if (report.passed === true) { const p = document.createElement('p'); p.textContent = `本次核对通过${report.modelCalls === 0 ? '，未调用模型' : ''}。`; results.append(p); }
        for (const [index, record] of (report.records || []).entries()) {
          if (typeof record.result?.text === 'string') { const h = document.createElement('h3'); h.textContent = `回答 ${index + 1}`; const p = document.createElement('div'); p.className = 'lesson-run-answer'; renderMarkdown(p, record.result.text); results.append(h, p); }
        }
      }
    }
    for (const file of run.files) { const li = document.createElement('li'), link = document.createElement('a'); link.href = file.url; link.target = '_blank'; link.textContent = file.name; li.append(link); files.append(li); }
    if (!results.childNodes.length && run.state === 'completed') { details.open = true; }
  }
  async function request(url: string, method = 'GET', body?: unknown) {
    const response = await fetch(url, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '实验请求失败。'); return data;
  }
  function failed(error: unknown) { status.textContent = error instanceof Error ? error.message : '无法连接实验服务。'; start.disabled = false; select.disabled = false; }
  async function poll() { try { if (id) await show(await request(`/api/lesson-runs/${id}`)); } catch (error) { failed(error); } }
  start.addEventListener('click', async () => {
    clearTimeout(timer); start.disabled = true; select.disabled = true; status.textContent = '正在启动'; results.replaceChildren(); files.replaceChildren();
    try { await show(await request('/api/lesson-runs', 'POST', { chapter, action: select.value })); } catch (error) { failed(error); }
  });
  stop.addEventListener('click', async () => { try { await request(`/api/lesson-runs/${id}/stop`, 'POST'); clearTimeout(timer); await poll(); } catch (error) { failed(error); } });
  void request(`/api/lesson-runs?chapter=${chapter}`).then(data => { if (data.run) { select.value = data.run.action; hint(); return show(data.run); } }).catch(failed);
}
