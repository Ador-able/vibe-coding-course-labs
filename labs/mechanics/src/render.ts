import type { analyze, models } from './tokenization.ts';

type Analysis = ReturnType<typeof analyze>;
type Model = (typeof models)[number];

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, className?: string) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function visibleText(text: string) {
  return text.replaceAll(' ', '␠').replaceAll('\n', '↵').replaceAll('\t', '⇥').replaceAll('\r', '␍');
}

export function renderResult(model: Model, data: Analysis): HTMLElement {
  const card = document.createElement('article');
  const heading = document.createElement('div');
  heading.className = 'result-heading';
  heading.append(node('h2', model.name), node('p', `${data.count} 个 token`, 'count'));
  card.append(heading);
  const pieces = document.createElement('div');
  pieces.className = 'pieces';
  pieces.setAttribute('aria-label', `${model.name} 的文本分段`);
  data.groups.forEach((group, index) => {
    const piece = node('span', '', `token color-${index % 5}`);
    piece.append(node('span', visibleText(group.text)));
    const count = group.end - group.start;
    piece.append(node('small', count === 1 ? String(group.ids[0]) : `合并 ${count} 个 token`));
    piece.title = `token ID：${group.ids.join('、')}`;
    pieces.append(piece);
  });
  if (!data.groups.length) pieces.append(node('p', '空文本对应 0 个 token。', 'empty'));
  card.append(pieces, node('p', '单个 token 下方显示 ID；␠ 为空格，↵ 为换行，⇥ 为制表符。', 'legend'));
  if (data.groups.some((group) => group.end - group.start > 1)) {
    card.append(node('p', '部分字符横跨 token。相关 token 合并显示，数量已标在色块内；真实边界见下方字节表。', 'byte-note'));
  }
  card.append(node('h3', '把全部 token ID 解码'));
  card.append(node('pre', data.decoded || '（空文本）', 'decoded'));
  card.append(node('p', data.exactRoundTrip ? '与输入文本一致。' : '与原输入不同：此分词器会规范化部分字符。', data.exactRoundTrip ? 'round-trip' : 'round-trip different'));
  if (!data.exactRoundTrip) {
    const normalization = document.createElement('details');
    normalization.className = 'normalization';
    normalization.append(node('summary', '查看规范化前后的字符'));
    normalization.append(node('p', '例如 e 与组合重音符可变成预组合的 é。看起来相同，码点仍可能不同。'));
    normalization.append(node('pre', `输入：${codePoints(data.input)}\n解码：${codePoints(data.decoded)}`));
    card.append(normalization);
  }
  const details = document.createElement('details');
  details.append(node('summary', '查看 token ID 和字节'));
  details.append(node('p', '字节列来自分词库的 ByteLevel 映射。不能独立解码的片段要与相邻 token 拼接。', 'detail-note'));
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const headingRow = document.createElement('tr');
  for (const label of ['序号', 'token ID', '单独解码', 'UTF-8 字节']) headingRow.append(node('th', label));
  head.append(headingRow);
  const body = document.createElement('tbody');
  for (const token of data.tokenDetails) {
    const row = document.createElement('tr');
    row.append(node('td', String(token.index + 1)), node('td', String(token.id), 'monospace'));
    row.append(node('td', token.independentText === null ? '需与相邻 token 拼接' : visibleText(token.independentText), token.independentText === null ? 'partial' : 'monospace'));
    row.append(node('td', token.bytes.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' '), 'monospace'));
    body.append(row);
  }
  table.append(head, body);
  const scroll = document.createElement('div');
  scroll.className = 'table-scroll';
  scroll.append(table);
  details.append(scroll);
  if (data.tokenDetails.some((token) => token.special)) details.append(node('p', '输入中包含已被词表识别的特殊 token 字符串；它们来自输入，没有自动追加。', 'detail-note'));
  card.append(details);
  const source = document.createElement('details');
  source.className = 'source';
  source.append(node('summary', '分词器版本与使用范围'));
  source.append(node('p', model.repository), node('p', `固定提交：${model.revision}`, 'monospace'));
  source.append(node('p', `配置许可：${model.license}。本实验仅观察公开配置，不代表同名在线产品当前采用的分词器。`));
  const link = node('a', '查看官方分词器文件');
  link.href = `https://huggingface.co/${model.repository}/blob/${model.revision}/tokenizer.json`;
  link.target = '_blank';
  link.rel = 'noreferrer';
  source.append(link);
  card.append(source);
  return card;
}

function codePoints(text: string) {
  return Array.from(text, (character) => `U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`).join(' ');
}
