const ui = {
  form: document.querySelector('#locate-form'), query: document.querySelector('#query'),
  condition: document.querySelector('#condition'), locate: document.querySelector('#locate'),
  status: document.querySelector('#status'), retry: document.querySelector('#retry'),
  question: document.querySelector('#question'), range: document.querySelector('#range'),
  lists: document.querySelector('#rank-lists'), heading: document.querySelector('#document-heading'),
  context: document.querySelector('#context'), locator: document.querySelector('#locator'),
  pageTitle: document.querySelector('#page-title'), sourceStatus: document.querySelector('#source-status'),
  source: document.querySelector('#source-page'), pages: document.querySelector('#page-buttons'),
  image: document.querySelector('#image-link'), fullBody: document.querySelector('#full-body'),
  selection: document.querySelector('#selection-record'), raw: document.querySelector('#raw-record'),
  details: document.querySelector('#record-details'), file: document.querySelector('#file-download')
};
const state = { observation: null, queryId: 'Q1', condition: 'base', selectedId: null,
  sourceId: null, sourcePage: null, sourceBody: null, loading: false, error: null };
let pageImages, sourceDocument, sourceRequest = 0;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
async function read(url, json = true) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url}：HTTP ${response.status}`);
  return json ? response.json() : response.text();
}
function currentCase() {
  return state.observation?.ranking.cases.find(x => x.queryId === state.queryId && x.condition === state.condition);
}
function documentById(id) { return state.observation?.corpus.find(x => x.id === id); }
function selectedDocument() { return documentById(state.selectedId); }
function currentContainsSelection() { return currentCase()?.fusion.all.some(x => x.id === state.selectedId); }
function sourceLabel() {
  const row = documentById(state.sourceId);
  if (row) ui.sourceStatus.textContent = `${state.sourceId === state.selectedId ? '已回查' : '上次回查'}：${row.title} · ${row.version} · ${row.adoption}`;
}
function render() {
  const selectedCase = currentCase();
  if (!selectedCase) return;
  const union = selectedCase.fusion.all;
  if (union.length && !union.some(x => x.id === state.selectedId)) state.selectedId = union[0].id;
  const row = selectedDocument();
  ui.question.textContent = selectedCase.question;
  const where = selectedCase.where;
  ui.range.textContent = `${where.collection === 'memo' ? '教师便签' : '历史小说草稿'} · 版本${where.version}${where.projectCode ? ' · 编号' + where.projectCode : ''} · ${selectedCase.eligibleIds.length}条资料在范围内`;
  const query = state.observation.queries.find(x => x.id === state.queryId);
  ui.condition.options[1].textContent = query.filterVariant.projectCode ? '精确编号 AX-17' : '版本 v9';
  ui.lists.replaceChildren();
  for (const [label, hits] of [['关键词', selectedCase.lexical.top], ['语义', selectedCase.semantic.top], ['融合', selectedCase.fusion.top]]) {
    const column = element('section', undefined, 'ranking-column');
    column.append(element('h3', label));
    if (!hits.length) column.append(element('p', '无候选', 'document-label'));
    hits.forEach((hit, index) => {
      const button = element('button', undefined, 'candidate');
      button.type = 'button'; button.dataset.id = hit.id;
      button.setAttribute('aria-pressed', String(hit.id === state.selectedId));
      button.append(element('strong', `${index + 1} · ${hit.document.title}`),
        element('span', hit.document.text.slice(0, 42) + (hit.document.text.length > 42 ? '…' : '')));
      button.addEventListener('click', () => { state.selectedId = hit.id; render(); });
      column.append(button);
    });
    ui.lists.append(column);
  }
  ui.heading.replaceChildren();
  if (row) {
    ui.heading.append(element('h2', `${union.length ? '选中' : '上次查看'}：${row.title}`),
      element('p', row.adoption, 'document-label'));
    ui.context.textContent = row.text;
    const range = row.source.bodyRange;
    const location = row.collection === 'story' ? `物理第${row.source.physicalPages.join('、')}页`
      : `完整便签 · 第${row.source.lineRange[0]}—${row.source.lineRange[1]}行`;
    ui.locator.textContent = `${row.docId} · ${row.version} · ${location} · 正文范围[${range.start}, ${range.end})`;
  } else {
    ui.context.textContent = '此范围没有候选。'; ui.locator.textContent = '';
  }
  ui.locate.disabled = !union.length;
  ui.status.textContent = union.length
    ? '两路候选来自同一资料范围；选中完整文字后回查原文。'
    : '筛选后没有候选。问题、上次选择和已查看的原文保留；这不代表其他版本没有相关资料。';
  ui.selection.textContent = JSON.stringify(selectedCase, null, 2);
  sourceLabel();
}
function showPage(number) {
  const page = pageImages.find(x => x.physicalPage === number), row = documentById(state.sourceId);
  if (!page || !row) return;
  state.sourcePage = number;
  ui.pageTitle.textContent = `${row.title} · 第${number}页`;
  const frame = element('div', undefined, 'page-frame'), image = element('img');
  image.src = page.imagePath; image.alt = `${row.title}，原始第${number}页`;
  image.addEventListener('error', () => {
    if (state.sourceId !== row.id || state.sourcePage !== number) return;
    state.error = '原页图未能载入';
    ui.source.replaceChildren(element('p', '原页图未能载入；选中块与完整文字保留，可下载对应原文件。', 'gap'));
  });
  frame.append(image); ui.source.replaceChildren(frame);
  ui.image.href = page.imagePath; ui.image.hidden = false;
}
async function openSource() {
  const row = selectedDocument();
  if (!row || !currentContainsSelection()) return;
  const request = ++sourceRequest;
  try {
    const body = await read(row.collection === 'story' ? 'original-body.txt' : `materials/${encodeURIComponent(row.source.fileName)}`, false);
    if (request !== sourceRequest || row.id !== state.selectedId || !currentContainsSelection()) return;
    const range = row.source.bodyRange;
    if (body.slice(range.start, range.end) !== row.text) throw new Error('选中块与来源文字位置不一致');
    state.sourceId = row.id; state.sourceBody = body; state.error = null;
    ui.fullBody.textContent = body; ui.pages.replaceChildren();
    ui.file.href = row.collection === 'story' ? sourceDocument.filePath : `materials/${encodeURIComponent(row.source.fileName)}`;
    ui.file.hidden = false;
    if (row.collection === 'story') {
      for (const number of row.source.physicalPages) {
        const button = element('button', `第${number}页`); button.type = 'button';
        button.addEventListener('click', () => showPage(number)); ui.pages.append(button);
      }
      showPage(row.source.physicalPages[0]);
    } else {
      state.sourcePage = null; ui.pageTitle.textContent = `${row.title} · 完整便签`;
      ui.source.replaceChildren(element('div', body, 'extracted-text')); ui.image.hidden = true;
    }
    sourceLabel(); ui.pageTitle.scrollIntoView({ block: 'nearest' });
  } catch (error) {
    if (request !== sourceRequest) return;
    state.error = error.message;
    ui.sourceStatus.textContent = `原文未能载入：${error.message}。选中块和先前原文保留。`;
  }
}
ui.form.addEventListener('submit', event => { event.preventDefault(); openSource(); });
ui.query.addEventListener('change', () => { state.queryId = ui.query.value; render(); });
ui.condition.addEventListener('change', () => { state.condition = ui.condition.value; render(); });
for (const button of document.querySelectorAll('button[data-direction]')) {
  button.addEventListener('click', () => {
    document.body.dataset.direction = button.dataset.direction;
    for (const peer of document.querySelectorAll('button[data-direction]')) peer.setAttribute('aria-pressed', String(peer === button));
  });
}
ui.details.addEventListener('toggle', () => {
  if (ui.details.open && state.observation) ui.raw.textContent = JSON.stringify(state.observation, null, 2);
});
async function loadRecord() {
  state.loading = true; state.error = null; ui.retry.hidden = true;
  ui.status.textContent = '正在读取固定观察。';
  try {
    const [observation, images, original] = await Promise.all([
      read('observation.json'), read('page-images.json'), read('source-document.json')
    ]);
    state.observation = observation; pageImages = images; sourceDocument = original;
    ui.query.replaceChildren();
    for (const query of observation.queries) {
      const option = element('option', `${query.id} · ${query.question}`); option.value = query.id; ui.query.append(option);
    }
    ui.query.value = state.queryId; ui.condition.value = state.condition;
    ui.query.disabled = false; ui.condition.disabled = false;
    state.loading = false; render();
    if (ui.details.open) ui.raw.textContent = JSON.stringify(observation, null, 2);
  } catch (error) {
    state.error = error.message; state.loading = false; ui.retry.hidden = false;
    ui.status.textContent = `记录未载入：${error.message}。问题和已有选择保留，请检查静态文件后重新载入。`;
  }
}
ui.retry.addEventListener('click', loadRecord);
await loadRecord();
// 供核查实际页面的同一选择对象；只读记录，不发云请求或写业务状态。
window.retrievalObservation = () => ({ runId: state.observation?.runId ?? null, queryId: state.queryId,
  condition: state.condition, selectedId: state.selectedId, selectedText: selectedDocument()?.text ?? null,
  where: currentCase()?.where ?? null, selectedCase: currentCase() ?? null,
  sourceId: state.sourceId, sourceBody: state.sourceBody, sourcePage: state.sourcePage,
  direction: document.body.dataset.direction, error: state.error, loading: state.loading });
