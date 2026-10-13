export const $ = id => document.getElementById(id);
export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export async function json(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(response.status === 404 ? '这一阶段尚未保存课堂实录。' : `记录读回失败（HTTP ${response.status}）`);
  return response.json();
}
export async function text(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`原文未能读回（HTTP ${response.status}）`);
  return response.text();
}
export function select(labelText, options, change) {
  const label = element('label', labelText);
  const input = element('select');
  input.append(...options.map(([value, name]) => { const option = element('option', name); option.value = value; return option; }));
  if (change) input.addEventListener('change', change);
  label.append(input); $('controls').append(label); return input;
}
export function button(name, action, primary = false) {
  const node = element('button', name, primary ? 'primary' : undefined); node.type = 'button'; node.addEventListener('click', action); return node;
}
export function resetSource() {
  $('source-title').textContent = '原文依据'; $('source-content').replaceChildren(element('p', '选择结果后在这里回查。', 'muted')); $('original-link').hidden = true;
}
export function showPage(page, title, block) {
  $('source-title').textContent = `${title} · 第${page.physicalPage}页`;
  $('source-content').replaceChildren(); $('original-link').hidden = !page.imagePath;
  if (!page.imagePath) { $('source-content').append(element('p', '原页图像未能生成，保留实际读取记录。', 'gap')); return; }
  $('original-link').href = page.imagePath;
  const frame = element('div', undefined, 'page-frame');
  const image = element('img'); image.src = page.imagePath; image.alt = `${title}，第${page.physicalPage}物理页`; frame.append(image);
  if (block && page.rotation === 0) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', `0 0 ${page.width} ${page.height}`);
    const rect = document.createElementNS(svg.namespaceURI, 'rect'); const [x, y, right, bottom] = block.bbox;
    for (const [key, value] of Object.entries({ x, y, width: right - x, height: bottom - y })) rect.setAttribute(key, value);
    svg.append(rect); frame.append(svg);
  }
  $('source-content').append(frame);
}
export function raw(value) { $('raw').textContent = JSON.stringify(value, null, 2); }
export function section(title, value) {
  const node = element('section', undefined, 'section'); node.append(element('h3', title), element('div', value, 'body-text')); return node;
}
