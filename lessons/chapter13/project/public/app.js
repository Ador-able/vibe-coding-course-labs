const page = document.body.dataset.page;
const ui = Object.fromEntries(['title', 'intro', 'controls', 'status', 'work', 'config'].map(id => [id, document.getElementById(id)]));
const definitions = {
  long: ['长文怎样保留整体关系', '沿着每一步实际收到的材料，回查交接摘要保留了什么。'],
  classification: ['先统一原文分类口径', '读一个完整原段，再看主题、原句依据和处理状态。'],
  extraction: ['从原文抽取人群数量', '从原文核对字段；未知、实际零和计划量分别保留。'],
  batch: ['保存每一项的状态', '保留逐项原答，只修复本轮确需处理的真实候选。'],
  templates: ['改模板后核对整个任务', '比较同一批材料的两份实际结果，继续查汇总与文件读回。']
};
const fields = { sourceId: '来源', group: '本项人群', status: '当前或计划', totalCount: '准确总人数', formalCount: '本段明说的正式人数', probationaryCount: '本段明说的记名人数', duplicateOf: '同段重复来源', distinctSourceIds: '去重后的原段', ratioSourceIds: '比例来源', formalNumerator: '同行正式人数', groupDenominator: '同组总人数', formalRatio: '同组正式比例', unknownTotalSourceIds: '准确总数未知项', plannedSourceIds: '计划项' };
const statusNames = { passed: '通过', failed: '未通过', returned: '已返回', running: '运行中', started: '已开始', provided: '教师提供', unavailable: '未取得', pending: '待人工核对', needs_human: '待人工核对', exercise_input: '练习输入', observed: '已发生或已宣布', planned: '计划需求或指令', classified: '已归主题', unknown: '信息不足', other: '当前口径未覆盖', ungraded: '发现候选，尚未定口径', exported: '已导出' };
const names = { '01-whole': '全文输入', '02-map-1': '第一段笔记', '02-map-2': '第二段笔记', '02-map-3': '第三段笔记', '03-reduce': '汇总三份笔记', '04-refine-1': '逐块修订 · 第一段', '04-refine-2': '逐块修订 · 第二段', '04-refine-3': '逐块修订 · 第三段' };
let data;
const text = (tag, value, className) => { const node = document.createElement(tag); node.textContent = value ?? ''; if (className) node.className = className; return node; };
const pretty = value => JSON.stringify(value, null, 2);
const parse = value => { try { return JSON.parse(value); } catch { return null; } };
const details = (label, value) => { const node = document.createElement('details'); node.append(text('summary', label), text('pre', typeof value === 'string' ? value : pretty(value))); return node; };
const panel = title => { const node = document.createElement('section'); node.className = 'panel'; node.append(text('h2', title)); return node; };
function select(label, entries, initial) {
  const wrapper = text('label', label), control = document.createElement('select');
  for (const [value, name] of entries) { const option = text('option', name); option.value = value; control.append(option); }
  if (initial) control.value = initial; wrapper.append(control); ui.controls.append(wrapper); return control;
}
function operation(action) { const button = text('button', '查看结果'); button.type = 'button'; button.addEventListener('click', action); ui.controls.append(button); return button; }
function empty(message = '这一步的课堂实录尚未保存。') { ui.work.replaceChildren(text('p', message, 'empty')); ui.status.textContent = ''; }
function fieldTable(row, columns = data.material.reference.fields) {
  const table = document.createElement('table'); table.className = 'field-table';
  for (const key of columns) { const tr = document.createElement('tr'); tr.append(text('th', fields[key] || key), text('td', row?.[key] === null ? key === 'duplicateOf' ? '不是重复导入' : '未知（null）' : Array.isArray(row?.[key]) ? row[key].join('、') : key === 'status' ? statusNames[row?.[key]] || row?.[key] : String(row?.[key] ?? '未返回'))); table.append(tr); }
  return table;
}
function recordFields(row) {
  const fragment = document.createDocumentFragment();
  fragment.append(fieldTable(row, ['group', 'status', 'totalCount', 'formalCount', 'probationaryCount']));
  const source = document.createElement('details'); source.append(text('summary', '来源与重复导入关系'), fieldTable(row, ['sourceId', 'duplicateOf']));
  fragment.append(source); return fragment;
}
function evidence(row) { return details('本项原句依据', row.evidence || '未给出原句依据'); }
function checkView(check) {
  const wrapper = document.createElement('details'); wrapper.append(text('summary', '程序检查与待核事项'));
  if (!check) { wrapper.append(text('p', '尚未形成程序检查。', 'muted')); return wrapper; }
  wrapper.append(text('p', `程序检查：${statusNames[check.mechanicalState] || '未取得'}；含义与采用待人工核对。`, 'criterion'));
  if (check.han !== undefined) wrapper.append(text('p', `实际摘要 ${check.han} 汉字；要求 ${check.hanRange.join('—')}。`, 'criterion'));
  for (const key of ['parseError', 'formatIssues', 'coverageIssues', 'valueIssues', 'evidenceIssues', 'summaryIssues', 'invalidSourceIds', 'issues']) {
    const value = check[key]; if (value && (!Array.isArray(value) || value.length)) wrapper.append(text('pre', pretty(value)));
  }
  return wrapper;
}
function rawView(call) {
  const wrapper = document.createElement('details'); wrapper.append(text('summary', '完整请求与实录来源'));
  wrapper.addEventListener('toggle', async () => {
    if (!wrapper.open || wrapper.dataset.loaded) return; wrapper.dataset.loaded = 'true';
    try { const response = await fetch(call.recordUrl); if (!response.ok) throw new Error(`HTTP ${response.status}`); wrapper.append(text('pre', pretty(await response.json()))); }
    catch (error) { wrapper.append(text('p', '这份实录未能读回：' + error.message, 'warning')); }
  }); return wrapper;
}
function resultView(call) {
  const node = panel('本轮实际结果');
  if (!call?.result) { node.append(text('p', '没有取得本轮原答。', 'warning'), details('实际失败记录', call?.error)); return node; }
  const value = parse(call.result.text);
  if (value && typeof value.summary === 'string') {
    node.append(text('div', value.summary, 'result'));
    if (Array.isArray(value.unresolved)) { node.append(text('h3', '仍待核实')); const list = document.createElement('ul'); for (const item of value.unresolved) list.append(text('li', item)); node.append(list); }
    if (Array.isArray(value.evidence)) node.append(details('判断与原段依据', value.evidence));
  } else node.append(text('pre', call.result.text));
  node.append(checkView(call.check), rawView(call)); return node;
}
function originalLog(id) {
  const source = data.material.logs.records.find(row => row.id === id), node = panel('本项完整原文');
  node.append(text('p', '本项范围：' + source.scope, 'muted'), text('div', source.text, 'prose'), details('原文位置与任务身份', { id: source.id, originalSourceId: source.originalSourceId, start: source.start, end: source.end })); return node;
}
function recordView(call, id, title = '本轮实际字段') {
  const node = panel(title), parsed = parse(call?.result?.text), row = parsed?.records?.find(record => record.sourceId === id);
  if (row) node.append(recordFields(row), evidence(row));
  else node.append(text('p', call?.check?.parseError ? '回答格式未通过，尚未导入字段。' : '没有取得本项字段。', 'warning'), details('完整实际原答', call?.result?.text || call?.error));
  if (call) node.append(checkView(call.check), rawView(call)); return node;
}
function longPage() {
  const current = select('整理步骤', Object.entries(names), '03-reduce');
  const show = () => {
    const run = data.runs['long-text'], call = run?.calls.find(item => item.id === current.value); if (!call) { empty(); return; }
    const left = panel('这一步实际可见的材料'); left.classList.add('source-column');
    const note = (label, raw) => { const value = parse(raw); left.append(text('h3', label), text('div', value?.summary || '未取得可解析摘要。', 'prose'), details('未决事项、证据与完整原答', raw || '未取得')); };
    if (call.id === '03-reduce') for (const id of call.materialScope) { const prior = run.calls.find(item => item.id === id); note(names[id], prior.result?.text); }
    else {
      const prior = call.materialScope.find(id => id.startsWith('04-refine'));
      if (prior) note('上一份实际摘要', run.calls.find(item => item.id === prior)?.result?.text);
      const chapters = data.material.long.chapters.filter(item => call.materialScope.includes(item.chapterId));
      for (const [index, chapter] of chapters.entries()) {
        let container = left;
        if (index > 0) { container = document.createElement('details'); container.append(text('summary', chapter.title + ' · 完整原段')); left.append(container); }
        else container.append(text('h3', chapter.title));
        for (const p of chapter.paragraphs) { const paragraph = text('p', p.text, 'paragraph prose'); paragraph.prepend(text('span', p.sourceId, 'source-id')); container.append(paragraph); }
      }
    }
    left.append(details('共同元信息与完整发送文字', call.input.instructions + '\n\n' + call.input.prompt));
    ui.work.replaceChildren(left, resultView(call)); ui.status.textContent = `${names[call.id]} · ${statusNames[call.status]}；原文与摘要含义仍待核对。`;
  };
  current.addEventListener('change', () => empty('已切换步骤，点击“查看结果”。')); operation(show); show();
}
function classificationPage() {
  const stage = select('口径阶段', [['discovery', '发现候选主题'], ['v1', '口径 v1'], ['v2', '口径 v2']], 'v1');
  const source = select('原段', data.material.labels.records.map(row => [row.id, `${row.id} · ${row.text.slice(0, 20)}…`]), 'F03');
  const show = () => {
    const run = data.runs[`classification-${stage.value}`], call = run?.calls.find(item => item.materialScope.includes(source.value)); if (!call) { empty(); return; }
    const row = data.material.labels.records.find(item => item.id === source.value), left = panel('本条完整原段'); left.append(text('div', row.text, 'prose'));
    const right = panel('本轮实际分类'); const value = parse(call.result?.text);
    if (stage.value === 'discovery') {
      right.append(text('p', '本批发现的候选尚未成为统一口径。', 'muted'));
      const candidates = Array.isArray(value?.candidates) ? value.candidates.filter(candidate => Array.isArray(candidate.evidence) && candidate.evidence.some(quote => quote.recordId === source.value)) : [];
      for (const candidate of candidates) { right.append(text('h3', candidate.name), text('p', candidate.description, 'muted')); for (const quote of candidate.evidence.filter(quote => quote.recordId === source.value)) right.append(text('div', quote.quote, 'prose')); }
      if (!candidates.length) right.append(text('p', '本条没有取得可定位的候选主题，回查本批完整原答。', 'muted'));
      right.append(details('完整本批结果', call.result?.text || call.error));
    }
    else {
      const item = value?.items?.find(item => item.id === source.value), codebook = data.material.codebooks[stage.value];
      if (item) {
        right.append(text('p', statusNames[item.status] || item.status));
        for (const label of item.labels || []) right.append(text('h3', codebook.labels.find(item => item.code === label.code)?.name || label.code), text('div', label.quote, 'prose'));
        right.append(text('p', item.reason, 'muted'));
      } else right.append(text('p', '本批未取得约定的可解析分类；原答保留。', 'warning'), details('完整实际原答', call.result?.text || call.error));
      left.append(details('本轮完整标签口径', codebook));
    }
    right.append(checkView(call.check), rawView(call)); ui.work.replaceChildren(left, right);
    const submitted = run.calls.reduce((sum, item) => sum + item.materialScope.length, 0), usable = run.calls.reduce((sum, item) => sum + (item.check?.usableRecords || 0), 0);
    ui.status.textContent = stage.value === 'discovery' ? '候选发现 · 原文主题分类不等于证实人物议论或未来结果。' : `本版可解析且通过结构与原句检查 ${usable}/${submitted} 条；含义另核。`;
  };
  for (const control of [stage, source]) control.addEventListener('change', () => empty('已切换原段或口径，点击“查看结果”。')); operation(show); show();
}
function extractionPage(templates = false) {
  const version = templates ? select('模板', [['V1', '模板 V1'], ['V2', '模板 V2']], 'V1') : null;
  const ids = data.material.logs.scope[templates ? 'templateComparison' : 'extraction'];
  const source = select('原文人群', ids.map(id => [id, id + ' · ' + data.material.reference.records.find(row => row.sourceId === id).group.replaceAll('\n', ' · ')]), 'R06');
  const show = () => {
    const run = data.runs[templates ? 'templates' : 'extraction'], call = run?.calls.find(item => item.id === (templates ? version.value : 'extract')); if (!call) { empty(); return; }
    const left = originalLog(source.value), right = recordView(call, source.value), candidate = parse(call.result?.text);
    const summary = document.createElement('details'); summary.append(text('summary', '整批汇总与资格集合'));
    if (candidate?.summary) summary.append(fieldTable(candidate.summary, Object.keys(data.material.reference.summaries[templates ? 'ten' : 'eight'])), details('实际汇总全部内容', candidate.summary));
    if (call.csv) summary.append(text('p', `实际候选 CSV：${statusNames[call.csv.export?.state] || call.csv.export?.state || '未导出'}；独立进程读回：${statusNames[call.csv.readback?.state] || '未形成'}。`, 'criterion'), details('完整文件读回记录', call.csv));
    else summary.append(text('p', '这份候选的 CSV 读回记录尚未形成。', 'muted'));
    right.append(summary); ui.work.replaceChildren(left, right); ui.status.textContent = '字段来自现成小说原段；数量范围、统计分母与文件读回分别核对。';
  };
  for (const control of [version, source].filter(Boolean)) control.addEventListener('change', () => empty('已切换原段或模板，点击“查看结果”。')); operation(show); show();
}
function batchPage() {
  const source = select('来源', data.material.logs.scope.batchBase.map(id => [id, id + ' · ' + data.material.reference.records.find(row => row.sourceId === id).group.replaceAll('\n', ' · ')]), 'R01');
  const show = () => {
    const item = data.batch?.items.find(item => item.sourceId === source.value); if (!item) { empty(); return; }
    const left = originalLog(source.value), right = panel('保存的各次结果');
    for (const attempt of item.attempts) {
      const title = attempt.kind === 'cloud' ? '整批抽取真实原项' : '本轮真实修复';
      const section = document.createElement('details'); section.open = attempt.kind === 'cloud_repair' || item.attempts.length === 1; section.append(text('summary', title));
      section.append(text('p', `回答：${statusNames[attempt.generationState] || attempt.generationState} · 程序：${statusNames[attempt.check?.mechanicalState] || '检查未取得'} · 内容：${statusNames[attempt.contentDecision] || '待人工核对'}`, 'criterion'));
      if (attempt.record) section.append(recordFields(attempt.record), evidence(attempt.record)); else section.append(text('p', '本项未取得可解析对象；完整整批原答保留。', 'warning'));
      section.append(checkView(attempt.check));
      if (attempt.callPath) section.append(rawView({ recordUrl: '/' + data.batch.directory + '/' + attempt.callPath }));
      else if (attempt.kind === 'cloud' && data.runs.extraction?.calls[0]) section.append(rawView(data.runs.extraction.calls[0]));
      if (attempt.error) section.append(details('实际失败', attempt.error)); right.append(section);
    }
    right.append(details('独立进程读回与保留范围', data.batch.readback || '尚未保存独立读回记录。'));
    ui.work.replaceChildren(left, right); ui.status.textContent = '原项与真实修复分别保存；未修项字节保留，整批汇总没有自动重算或采用。';
  };
  source.addEventListener('change', () => empty('已切换来源，点击“查看结果”。')); operation(show); show();
}
ui.title.textContent = definitions[page][0]; ui.intro.textContent = definitions[page][1];
for (const link of document.querySelectorAll('nav a')) if (link.dataset.page === page) link.setAttribute('aria-current', 'page');
(async () => {
  try {
    const response = await fetch('lab.json'); if (!response.ok) throw new Error(`HTTP ${response.status}`); data = await response.json();
    if (!data.ready) { empty(data.message || '课堂材料与实录正在准备。'); return; }
    ({ long: longPage, classification: classificationPage, extraction: () => extractionPage(false), batch: batchPage, templates: () => extractionPage(true) })[page]();
  } catch (error) { empty('课堂记录未能载入：' + error.message); }
})();
(async () => { try { const response = await fetch('/api/config'), config = await response.json(); ui.config.textContent = config.ready ? '共用模型配置已保存' : '查看课堂实录不需要配置模型'; } catch { ui.config.textContent = '查看课堂实录不需要配置模型'; } })();
