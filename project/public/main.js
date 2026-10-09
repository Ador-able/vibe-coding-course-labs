const ui = {
  form: document.querySelector('#locate-form'), fixture: document.querySelector('#fixture'),
  query: document.querySelector('#query'), locate: document.querySelector('#locate'),
  status: document.querySelector('#status'), heading: document.querySelector('#document-heading'),
  hits: document.querySelector('#hits'), pages: document.querySelector('#pages'),
  pageTitle: document.querySelector('#page-title'), source: document.querySelector('#source-page'),
  imageLink: document.querySelector('#image-link'), fileDetails: document.querySelector('#file-details'),
  raw: document.querySelector('#raw-record'),
};
let observation;
let current;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function showOriginal(page, block) {
  ui.pageTitle.textContent = `原始第${page.physicalPage}页`;
  ui.source.replaceChildren();
  ui.imageLink.hidden = !page.imagePath;
  if (!page.imagePath) {
    ui.source.append(element('p', page.imageError ? '原页图像未能载入，详见解析记录。' : '没有该页图像。', 'gap'));
    return;
  }
  ui.imageLink.href = page.imagePath;
  const frame = element('div', undefined, 'page-frame');
  const image = element('img');
  image.src = page.imagePath;
  image.alt = `${current.fileName}，${current.label}，原始第${page.physicalPage}页`;
  frame.append(image);
  // 固定练习页旋转为0；矩形只表示成熟解析器返回的版式块位置。
  if (block && page.rotation === 0) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${page.width} ${page.height}`);
    svg.setAttribute('aria-label', '命中文字块的原页位置，不是正确性认证');
    const rect = document.createElementNS(svg.namespaceURI, 'rect');
    const [left, top, right, bottom] = block.bbox;
    for (const [name, value] of Object.entries({ x: left, y: top, width: right - left, height: bottom - top })) rect.setAttribute(name, value);
    svg.append(rect);
    frame.append(svg);
  }
  ui.source.append(frame);
}

function locateBlock(reference) {
  // 回查同时核对文件和解析版本，不能只按同名文件取第一段。
  if (reference.docId !== current.docId || reference.fileSha256 !== current.fileSha256 || reference.parseProfile !== current.parseProfile) {
    ui.status.textContent = '这条位置不属于当前文件版本，请回到对应原件。';
    return;
  }
  const page = current.pages.find(item => item.physicalPage === reference.physicalPage);
  const block = page?.blocks.find(item => item.locator.blockNo === reference.blockNo);
  if (!block) {
    ui.status.textContent = '这一位置没有可读取的文字块，原页和解析缺口需要回查。';
    return;
  }
  showOriginal(page, block);
}

function renderDocument() {
  ui.heading.replaceChildren(element('h2', current.fileName), element('p', `${current.label} · ${current.docId}`, 'document-label'));
  ui.hits.replaceChildren();
  ui.pages.replaceChildren();
  ui.source.replaceChildren();
  ui.pageTitle.textContent = '原页';
  ui.imageLink.hidden = true;
  const metadata = {
    runId: observation.runId, docId: current.docId, fileName: current.fileName,
    fileBytes: current.fileBytes, fileSha256: current.fileSha256,
    parseProfile: current.parseProfile, openStatus: current.openStatus,
    pageCount: current.pageCount, gaps: current.gaps,
  };
  ui.fileDetails.replaceChildren(element('pre', JSON.stringify(metadata, null, 2)));
  const sourceFile = element('a', '下载此版本原文件');
  sourceFile.href = current.filePath;
  sourceFile.download = current.fileName;
  ui.fileDetails.append(sourceFile);
  ui.raw.textContent = JSON.stringify(current, null, 2);
  if (current.openStatus !== 'opened') {
    ui.status.textContent = current.pageCount === null ? '文件未能打开，没有取得页数和正文；输入仍保留。' : `文件读取未完成，已识别${current.pageCount}个物理页；已有记录与异常保留。`;
    ui.pages.append(element('p', '不能把读取失败记成“0页、没有相关内容”。', 'gap'));
    return;
  }
  const gapCount = current.gaps.length;
  ui.status.textContent = gapCount ? `保留${current.pageCount}个物理页，其中${gapCount}页有解析缺口。` : `已提取${current.pageCount}页文字，仍需核对原页与含义。`;
  for (const page of current.pages) {
    const section = element('section', undefined, 'text-page');
    const heading = element('div', undefined, 'page-heading-row');
    heading.append(element('h3', `原始第${page.physicalPage}页`));
    const view = element('button', '看原页');
    view.type = 'button';
    view.addEventListener('click', () => showOriginal(page));
    heading.append(view);
    section.append(heading);
    if (page.textState === 'text-extracted') {
      section.append(element('div', page.text, 'extracted-text'));
    } else {
      section.append(element('p', page.textState === 'empty-text' ? '这一页没有提取到可用文字。原页仍在，需要核查。' : '这一页读取失败。已保留页号与异常。', 'gap'));
    }
    ui.pages.append(section);
  }
  if (current.pages.length) showOriginal(current.pages[0]);
}

ui.form.addEventListener('submit', event => {
  event.preventDefault();
  const query = ui.query.value.trim();
  if (!query || !current) return;
  ui.hits.replaceChildren(element('h3', '字面定位结果'));
  const hits = current.pages.flatMap(page => page.blocks.filter(block => block.text.includes(query)).map(block => ({ page, block })));
  if (!hits.length) {
    ui.hits.append(element('p', current.openStatus !== 'opened' ? '本文件没有完成读取，不能判断完整原件是否包含这句话。' : current.gaps.length ? '已提取的文字里没有找到。存在未读出的页，不能据此认定原文没有。' : '已提取文字里没有字面命中；这不证明原文件或含义里不存在。', 'gap'));
    return;
  }
  for (const { page, block } of hits) {
    const item = element('div', undefined, 'hit');
    item.append(element('p', block.text, 'hit-text'));
    const go = element('button', `回查第${page.physicalPage}页 · 文字块${block.locator.blockNo}`);
    go.type = 'button';
    go.addEventListener('click', () => {
      locateBlock(block.locator);
      ui.source.parentElement.scrollIntoView({ block: 'start' });
    });
    item.append(go, element('p', `${current.label} · 文件 ${current.fileSha256.slice(0, 12)}…`, 'locator-caption'));
    ui.hits.append(item);
  }
  locateBlock(hits[0].block.locator);
});

ui.fixture.addEventListener('change', () => {
  current = observation.documents.find(item => item.fixtureKey === ui.fixture.value);
  renderDocument();
});
for (const button of document.querySelectorAll('button[data-direction]')) {
  button.addEventListener('click', () => {
    document.body.dataset.direction = button.dataset.direction;
    for (const peer of document.querySelectorAll('button[data-direction]')) peer.setAttribute('aria-pressed', String(peer === button));
    // 切换只改样式，当前原件、命中、页号、草稿和记录对象保持不动。
  });
}

try {
  const response = await fetch('observation.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`读取记录返回HTTP ${response.status}`);
  observation = await response.json();
  for (const item of observation.documents) {
    const option = element('option', `${item.label} · ${item.fileName}`);
    option.value = item.fixtureKey;
    ui.fixture.append(option);
  }
  current = observation.documents[0];
  ui.fixture.disabled = false;
  ui.locate.disabled = false;
  renderDocument();
} catch (error) {
  ui.status.textContent = '没有可读取的解析记录，请按README准备材料并运行资料读取。';
  ui.raw.textContent = `${error.name}: ${error.message}`;
}
