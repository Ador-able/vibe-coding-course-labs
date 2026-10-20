import { $, element, json, text, select, button, resetSource, showPage, raw, section } from './shared.js';

const stage = document.body.dataset.stage;
let reading;
let sourceRevision = 0;
async function readingRecord() { return reading ||= await json('records/reading.json'); }
async function showSource(document) {
  const revision = ++sourceRevision; resetSource();
  try {
    if (document.collection === 'story') {
      const record = await readingRecord(); if (revision !== sourceRevision) return;
      const source = record.documents.find(row => row.fileSha256 === document.source.fileSha256);
      if (!source) throw new Error('当前原件与候选来源版本不同。');
      const pages = source.pages.filter(page => document.source.physicalPages.includes(page.physicalPage));
      const complete = element('div', document.text, 'body-text');
      const location = element('p', `第${document.source.physicalPages.join('、')}页 · 本轮实际取回的小块`, 'meta');
      const original = element('details'); const summary = element('summary');
      const originalContent = element('div'); original.append(summary, originalContent);
      let bar;
      if (pages.length > 1) {
        bar = element('div', undefined, 'page-buttons');
        for (const page of pages) bar.append(button(`第${page.physicalPage}页`, () => renderOriginal(page)));
      }
      function renderOriginal(page) {
        showPage(page, '凡人C05原文');
        originalContent.replaceChildren(...$('source-content').childNodes);
        if (bar) originalContent.prepend(bar);
        summary.textContent = `第${page.physicalPage}页完整原页`;
        $('source-title').textContent = '本轮候选原文';
        $('source-content').replaceChildren(location, complete, original);
      }
      renderOriginal(pages[0]);
    } else {
      const complete = await text(`materials/${encodeURIComponent(document.source.fileName)}`); if (revision !== sourceRevision) return;
      if (complete !== document.text) throw new Error('完整便签与候选来源快照不同。');
      $('source-title').textContent = `${document.title} · ${document.version}`;
      $('source-content').replaceChildren(element('p', document.originLabel || '凡人原文资料', 'meta'), element('div', complete, 'body-text'));
    }
  } catch (error) { if (revision === sourceRevision) $('source-content').replaceChildren(element('p', error.message, 'gap')); }
}

async function readingPage() {
  const record = await readingRecord(); $('origin').textContent = '课堂实录 · 本地读取';
  let current, hits = [], highlighted;
  const fixture = select('资料版本', record.documents.map(row => [row.fixtureKey, row.label]), changeDocument);
  const pageSelect = select('原页', [], () => { hits = []; highlighted = undefined; renderPage(); });
  const label = element('label', '需要回查的原句'); const query = element('input'); query.value = '神手谷'; label.append(query); $('controls').append(label);
  $('controls').append(button('定位原文', locate, true));
  function changeDocument() {
    sourceRevision++; current = record.documents.find(row => row.fixtureKey === fixture.value);
    hits = []; highlighted = undefined;
    pageSelect.replaceChildren(...current.pages.map(page => { const option = element('option', `第${page.physicalPage}页`); option.value = String(page.physicalPage); return option; }));
    pageSelect.disabled = !current.pages.length;
    if (!current.pages.length) { const unknown = element('option', '页数未知'); unknown.value = ''; pageSelect.append(unknown); }
    const gap = current.pages.find(page => page.textState !== 'text-extracted');
    pageSelect.value = String(gap?.physicalPage || current.pages[0]?.physicalPage || '');
    renderPage();
  }
  function renderPage(message) {
    resetSource();
    if (current.openStatus !== 'opened') {
      $('result').replaceChildren(element('h2', '未能读取这个文件'), element('p', current.error?.message || '读取失败。', 'gap'));
      $('status').textContent = message || '文件未能打开，页数和正文仍未知。'; raw({ runId: record.runId, document: current }); return;
    }
    const page = current.pages.find(row => row.physicalPage === Number(pageSelect.value));
    $('result').replaceChildren(element('h2', `第${page.physicalPage}页 · 提取文字`));
    $('result').append(page.textState === 'text-extracted' ? element('div', page.text, 'body-text') : element('p', page.textState === 'empty-text' ? '这一页没有读出可用文字。请回查右侧原页。' : '这一页读取失败，页号和原记录仍保留。', 'gap'));
    if (hits.length > 1) {
      const bar = element('div', undefined, 'page-buttons');
      for (const [index, hit] of hits.entries()) bar.append(button(`第${hit.page.physicalPage}页 · 第${index + 1}处`, () => { pageSelect.value = String(hit.page.physicalPage); highlighted = hit.block; renderPage(`找到${hits.length}处文字块，正在回查第${index + 1}处。`); }));
      $('result').prepend(bar);
    }
    $('status').textContent = message || (page.textState === 'empty-text' ? `第${page.physicalPage}页保留文字缺口；完整文件仍有${current.pageCount}个物理页。` : `当前为第${page.physicalPage}页；完整文件有${current.pageCount}个物理页。`);
    showPage(page, '凡人C05原文', highlighted);
    raw({ runId: record.runId, document: current, selectedPhysicalPage: page.physicalPage, highlighted: highlighted || null, literalHits: hits.map(hit => ({ physicalPage: hit.page.physicalPage, block: hit.block })) });
  }
  function locate() {
    const term = query.value.trim(); if (!term) return;
    hits = current.pages.flatMap(page => page.blocks.filter(block => block.text.includes(term)).map(block => ({ page, block })));
    highlighted = undefined;
    if (!hits.length) {
      const message = current.openStatus !== 'opened' ? '没有完成读取，无法判断原件是否包含这句话。' : current.gaps.length ? '已读文字没有命中。尚有未读出的页，请回查原图。' : '已读文字没有字面命中。';
      renderPage(message); return;
    }
    pageSelect.value = String(hits[0].page.physicalPage); highlighted = hits[0].block;
    renderPage(`找到${hits.length}处文字块，当前回查首处命中的第${hits[0].page.physicalPage}页。`);
  }
  changeDocument();
}

async function chunksPage() {
  const record = await json('records/chunks.json'); const source = await readingRecord();
  const native = source.documents.find(row => row.fixtureKey === 'native-v1');
  let answers; try { answers = await json('records/chunk-answers.json'); } catch { answers = null; }
  $('origin').textContent = '课堂实录 · 切块对照';
  const method = select('切分方式', record.methods.map(row => [row.condition.id, row.condition.label]), render);
  const query = select('字面查询', record.methods[0].retrievals.map(row => [row.term, row.term]), render);
  $('controls').append(button('查看返回材料', render, true));
  function render() {
    sourceRevision++; resetSource(); const current = record.methods.find(row => row.condition.id === method.value);
    const selected = current.retrievals.find(row => row.term === query.value);
    $('result').replaceChildren(element('h2', selected.context ? '实际返回的材料' : '没有字面命中'));
    $('status').textContent = `${current.chunks.length}个小块 · 按正文顺序取第一个字面命中。`;
    $('result').append(element('div', selected.context || '本轮没有返回上下文。', selected.context ? 'body-text' : 'gap'));
    const answer = answers?.records.find(row => row.methodId === method.value && row.term === query.value);
    if (answer) $('result').append(section('这轮真实回答', answer.result?.text || '没有得到完整可用正文。'), element('p', `模型结束：${answer.result?.finishReason || '失败'}；内容仍需回查。`, 'meta'));
    else if (query.value === '采药炼药') $('result').append(element('p', '这一切法的模型问答尚未保存。', 'muted'));
    const pages = selected.selectedChunk ? native.pages.filter(page => selected.selectedChunk.sourcePages.includes(page.physicalPage)) : [];
    if (pages.length) {
      showPage(pages[0], '凡人C05原文');
      if (pages.length > 1) {
        const bar = element('div', undefined, 'page-buttons'); for (const page of pages) bar.append(button(`第${page.physicalPage}页`, () => { showPage(page, '凡人C05原文'); $('source-content').prepend(bar); }));
        $('source-content').prepend(bar);
      }
    }
    raw({ comparison: record, selected, answer: answer || null });
  }
  render();
}

async function retrievalPage() {
  const record = await json('records/retrieval.json'); const cases = record.cases || record.ranking.cases;
  const ids = [...new Set(cases.map(row => row.queryId))]; $('origin').textContent = '课堂实录 · 两路检索';
  const query = select('问题', ids.map(id => [id, `${id} · ${cases.find(row => row.queryId === id).question}`]), () => { updateConditions(); render(); });
  const condition = select('资料范围', [], render); $('controls').append(button('查看候选', render, true));
  function updateConditions() { condition.replaceChildren(...cases.filter(row => row.queryId === query.value).map(row => { const node = element('option', row.condition === 'base' ? '原始范围' : row.where.version === 'v9' ? '不存在的版本' : '限定原文范围'); node.value = row.id; return node; })); }
  function render() {
    sourceRevision++; resetSource(); const current = cases.find(row => row.id === condition.value);
    $('result').replaceChildren(element('h2', current.question)); $('status').textContent = `当前范围有${current.eligibleIds.length}条资料；排名仍需回查原文。`;
    const ranking = element('div', undefined, 'ranking');
    for (const [key, title] of [['lexical', '关键词'], ['semantic', '向量'], ['fusion', '融合']]) {
      const list = element('div'); list.append(element('h3', title));
      const hits = current[key].top || current[key].all.slice(0, 3);
      if (!hits.length) list.append(element('p', '没有候选', 'muted'));
      for (const [index, hit] of hits.entries()) {
        const node = button('', () => { ranking.querySelectorAll('button').forEach(other => other.setAttribute('aria-pressed', String(other === node))); showSource(hit.document); });
        const story = hit.document.collection === 'story';
        const excerpt = story ? hit.document.text.replace(/\s+/g, ' ').trim() : '';
        const title = story ? excerpt.slice(0, 24) + (excerpt.length > 24 ? '…' : '') : hit.document.title;
        const location = story ? `第${hit.document.source.physicalPages.join('、')}页` : `创作便签 · ${hit.document.version}`;
        node.className = 'candidate'; node.append(element('strong', `${index + 1}. ${title}`), element('span', location, 'meta')); list.append(node);
      }
      ranking.append(list);
    }
    $('result').append(ranking); raw(current); ranking.querySelector('button')?.click();
  }
  updateConditions(); render();
}

async function answersPage() {
  const record = await json('records/update.json'); $('origin').textContent = '课堂实录 · 两轮问答';
  const available = ['A', 'B'].filter(key => record.phases[key]?.input);
  const answer = select('回答', available.map(key => [key, key === 'A' ? 'A · 更新前' : 'B · 更新后的追问']), render);
  const source = select('这轮依据', [], open); $('controls').append(button('回查依据', open, true));
  function render() {
    sourceRevision++; resetSource(); const current = record.phases[answer.value];
    $('result').replaceChildren(element('h2', current.input.question || current.input.followUp), element('div', current.result?.text || '这轮没有得到可用完整正文。', 'body-text'));
    $('status').textContent = answer.value === 'A' ? '保留 A 当时收到的 v1 来源。' : 'B 使用本轮实际候选和必要历史。';
    source.replaceChildren(...current.input.sources.map(row => { const node = element('option', `[${row.label}] ${row.title} · ${row.version}`); node.value = row.label; return node; }));
    raw(record); if (source.options.length) open();
  }
  function open() { const selected = record.phases[answer.value].input.sources.find(row => row.label === source.value); if (selected) showSource(selected); }
  render();
}

async function evaluationPage() {
  const cards = await json('records/evaluation-cards.json');
  const cache = new Map(); let revision = 0;
  const load = async name => { if (!cache.has(name)) cache.set(name, await json(`records/${name}.json`)); return cache.get(name); };
  $('origin').textContent = '教师题卡与实际证据';
  const question = select('题卡', cards.cases.map(card => [card.id, card.question]), render);
  const way = select('切分方式', [['fixed80', '固定长度'], ['structure80', '先段落，再标点'], ['overlap80x40', '重叠40'], ['parent80', '命中子块，返回所在页']], render);
  $('controls').append(button('查看证据', render, true));
  const counter = element('details'); counter.append(element('summary', '待核读法 · 教师练习'), element('div', cards.counterexample.text, 'body-text'), element('p', cards.counterexample.criteria, 'meta'));
  const transfer = element('details'); transfer.append(element('summary', '正午规则迁移题 · 尚未运行'), element('div', cards.transferMaterial.paragraphs.join('\n\n'), 'body-text'), element('p', cards.transferMaterial.question), element('p', cards.transferMaterial.execution, 'meta'));
  $('technical').before(counter, transfer);

  async function render() {
    const current = ++revision; sourceRevision++; resetSource();
    const card = cards.cases.find(card => card.id === question.value);
    way.parentElement.hidden = card.id !== 'E04-answer';
    const hasSource = !['E05-no-record', 'E06-conflict'].includes(card.id);
    $('source').hidden = !hasSource;
    document.querySelector('.workspace').style.gridTemplateColumns = hasSource ? '' : 'minmax(0, 1fr)';
    $('result').replaceChildren(element('h2', card.question));
    $('status').textContent = '正在读回这道题的完整证据。';
    raw({ card, evidence: null });
    let evidence;
    try {
      if (card.id === 'E01-reading') {
        const record = await readingRecord(); if (current !== revision) return;
        const document = record.documents.find(row => row.fixtureKey === 'scanned-v1');
        const page = document.pages.find(page => page.physicalPage === 2);
        const hitCount = page.blocks.filter(block => block.text.includes('神手谷')).length;
        $('result').append(element('p', `保留${document.pageCount}个物理页。第2页${page.textState === 'empty-text' ? '文字为空' : '文字状态见完整记录'}，原页${page.imagePath ? '已保留' : '未能生成'}。`), element('p', `在这一页已提取文字中，“神手谷”字面命中${hitCount}处。`, 'gap'));
        showPage(page, '凡人C05原文'); evidence = { runId: record.runId, document, page };
      } else if (card.id === 'E02-retrieval') {
        const [arithmetic, retrieval] = await Promise.all([load('evaluation'), load('retrieval')]); if (current !== revision) return;
        $('result').append(element('p', '以下覆盖率只比较预先标注的3个ID；大纲也含同类授课信息，完整资料库的召回率未评价。', 'meta'));
        const table = element('table', undefined, 'metrics-table'); const header = element('tr');
        for (const name of ['资料范围', '实际前2候选', '相关占比 P@2', '标注集覆盖 R@2', '首条命中 RR@2']) header.append(element('th', name));
        const head = element('thead'); head.append(header); table.append(head); const body = element('tbody');
        let firstButton;
        for (const metric of arithmetic.metrics.filter(row => card.conditions.includes(row.condition))) {
          const selected = retrieval.cases.find(row => row.id === metric.condition); const row = element('tr');
          row.append(element('th', metric.condition.endsWith('-base') ? '未限编号' : '限 C05')); const candidates = element('td');
          for (const [index, hit] of selected.fusion.top.slice(0, 2).entries()) {
            const candidate = button(`${index + 1}. ${hit.document.title}`, () => { table.querySelectorAll('button').forEach(node => node.setAttribute('aria-pressed', String(node === candidate))); showSource(hit.document); });
            candidate.className = 'candidate'; candidates.append(candidate); firstButton ||= candidate;
          }
          row.append(candidates, element('td', String(metric.precisionAt2)), element('td', String(metric.recallAt2)), element('td', String(metric.reciprocalRankAt2))); body.append(row);
        }
        table.append(body); const frame = element('div', undefined, 'table-frame'); frame.append(table); $('result').append(frame); firstButton?.click();
        evidence = { metrics: arithmetic.metrics.filter(row => card.conditions.includes(row.condition)), actualCases: retrieval.cases.filter(row => card.conditions.includes(row.id)) };
      } else if (card.id === 'E03-relations') {
        const record = await load('update'); if (current !== revision) return;
        const answer = record.phases.A;
        $('result').append(section('完整A原答', answer.result?.text || '本轮没有返回可用正文。'));
        const source = answer.input.sources.find(source => source.docId === 'fanren-C04-scope' && source.version === 'v1');
        if (source) showSource(source); evidence = answer;
      } else if (card.id === 'E04-answer') {
        const [record, chunks, source] = await Promise.all([load('chunk-answers'), load('chunks'), readingRecord()]); if (current !== revision) return;
        const answer = record.records.find(row => row.methodId === way.value);
        const method = chunks.methods.find(row => row.condition.id === way.value);
        const selected = method.retrievals.find(row => row.term === '采药炼药');
        $('result').append(section('本轮实际返回的材料', answer.input.context), section('完整模型原答', answer.result?.text || '本轮没有返回可用正文。'));
        const native = source.documents.find(row => row.fixtureKey === 'native-v1');
        const page = selected.selectedChunk && native.pages.find(page => selected.selectedChunk.sourcePages.includes(page.physicalPage));
        if (page) showPage(page, '凡人C05原文'); evidence = { method: method.condition, selected, answer };
      } else if (card.id === 'E05-no-record') {
        $('result').append(section('完整原文材料', card.sources.join('\n\n'))); evidence = card.sources;
      } else if (card.id === 'E06-conflict') {
        for (const [index, source] of card.sources.entries()) $('result').append(section(index === 0 ? '原文材料甲' : '原文材料乙', source.text), element('p', source.priority, 'meta'));
        evidence = card.sources;
      }
      if (current !== revision) return;
      const criteria = element('details'); const list = element('ol');
      for (const item of card.criteria) list.append(element('li', item)); criteria.append(element('summary', '查看本题判据'), list); $('result').append(criteria);
      $('status').textContent = card.id === 'E05-no-record' || card.id === 'E06-conflict' ? '教师迁移题卡 · 尚未检索或请求模型。' : card.execution;
      raw({ card, evidence });
    } catch (error) { if (current === revision) { $('status').textContent = error.message; $('result').append(element('p', error.message, 'gap')); } }
  }
  await render();
}

try { await ({ reading: readingPage, chunks: chunksPage, retrieval: retrievalPage, answers: answersPage, evaluation: evaluationPage })[stage](); }
catch (error) { $('status').textContent = error.message; $('result').replaceChildren(element('p', error.message, 'gap'), button('重新载入', () => location.reload())); }
try { const config = await json('/api/config'); $('config-state').textContent = config.textReady && config.embeddingReady ? '文字与向量模型设置已保存。页面只读取课堂记录；切换和回查不会调用模型。' : '页面只读取课堂记录。重新实验时，在首页保存共用模型设置。'; }
catch { $('config-state').textContent = '共用设置暂未读回；课堂记录仍可查看。'; }
