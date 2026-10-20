import { compareVectors, embeddingTable, lookupEmbeddings, type ExampleTokenId, type Vector2 } from './math';
import './style.css';

const a: Vector2 = [1, 1];
const sequences: readonly (readonly ExampleTokenId[])[] = [[2, 0, 2], [0, 1, 2], [1, 1, 0]];
const presets = [
  { label: '同向：B = (2, 2)', value: [2, 2] },
  { label: '更长：B = (3, 3)', value: [3, 3] },
  { label: '垂直：B = (−1, 1)', value: [-1, 1] },
  { label: '反向：B = (−1, −1)', value: [-1, -1] },
  { label: '零向量', value: [0, 0] },
] satisfies { label: string; value: Vector2 }[];

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header>
    <span class="eyebrow">模型机制实验</span>
    <h1>向量用一组数字表示信息</h1>
    <p>先按 token ID 取出一行数字，再观察向量的方向和长度。</p>
    <p class="scope">本页所有向量均为人工示例，不是模型的真实向量，也不代表词语含义。</p>
  </header>

  <section aria-labelledby="lookup-title">
    <div class="section-title"><span>01</span><h2 id="lookup-title">按编号查表，得到向量</h2></div>
    <div class="lookup-layout">
      <div>
        <p class="label">人工 embedding 表 · 每行 3 个数字</p>
        <table class="embedding-table">
          <thead><tr><th>token ID</th><th>第 1 维</th><th>第 2 维</th><th>第 3 维</th></tr></thead>
          <tbody>${embeddingTable.map((row, id) => `<tr class="id-${id}"><th>${id}</th>${row.map((value) => `<td>${value}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
      <div>
        <label class="label" for="sequence">输入的 token ID 序列</label>
        <select id="sequence">${sequences.map((ids, index) => `<option value="${index}">[${ids.join(', ')}]</option>`).join('')}</select>
        <div id="lookup-result" aria-live="polite"></div>
      </div>
    </div>
    <p class="note">取出的顺序由输入序列决定。同一个编号出现两次，就从这张表取出同一行两次。</p>
  </section>

  <section aria-labelledby="geometry-title">
    <div class="section-title"><span>02</span><h2 id="geometry-title">方向相同，长度也可以不同</h2></div>
    <p class="intro">换成便于画图的二维人工向量。固定 <strong class="a-color">A = (1, 1)</strong>，改变 <strong class="b-color">B</strong> 的两个坐标。</p>
    <div class="presets">${presets.map((preset, index) => `<button type="button" data-preset="${index}">${preset.label}</button>`).join('')}</div>
    <div class="geometry-layout">
      <div class="plot-wrap">
        <svg id="plot" viewBox="0 0 420 380" role="img" aria-labelledby="plot-title plot-description">
          <title id="plot-title">两个向量从同一个原点出发</title>
          <desc id="plot-description"></desc>
          <defs>
            <marker id="arrow-a" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L8,4 L0,8 Z" fill="#217a78" /></marker>
            <marker id="arrow-b" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L9,4.5 L0,9 Z" fill="#ad6815" /></marker>
          </defs>
          <g id="grid"></g>
          <g id="vectors"></g>
        </svg>
        <p class="plot-caption"><span class="a-color">━━ A</span><span class="b-color">━━ B</span><span>┄┄ 两个端点之间的距离</span></p>
      </div>
      <div class="observations">
        <div class="coordinates">
          <h3 id="b-title">B = (2, 2)</h3>
          <label for="bx">第 1 维 x <output id="bx-value">2</output></label>
          <input id="bx" type="range" min="-4" max="4" step="0.5" value="2" />
          <label for="by">第 2 维 y <output id="by-value">2</output></label>
          <input id="by" type="range" min="-4" max="4" step="0.5" value="2" />
        </div>
        <div id="metrics" aria-live="polite"></div>
      </div>
    </div>
    <details>
      <summary>查看公式和零向量的情况</summary>
      <dl class="formulas">
        <div><dt>长度</dt><dd>|A| = √(Aₓ² + Aᵧ²)</dd></div>
        <div><dt>内积</dt><dd>A · B = AₓBₓ + AᵧBᵧ</dd></div>
        <div><dt>余弦相似度</dt><dd>cos(A, B) = (A · B) / (|A| × |B|)</dd></div>
        <div><dt>欧氏距离</dt><dd>d(A, B) = √((Aₓ − Bₓ)² + (Aᵧ − Bᵧ)²)</dd></div>
      </dl>
      <p>零向量没有方向，余弦相似度未定义；内积和欧氏距离仍可计算。这里的坐标轴不表示任何真实语义。</p>
    </details>
  </section>
`;

const sequence = document.querySelector<HTMLSelectElement>('#sequence')!;
const lookupResult = document.querySelector<HTMLDivElement>('#lookup-result')!;
const bx = document.querySelector<HTMLInputElement>('#bx')!;
const by = document.querySelector<HTMLInputElement>('#by')!;
const presetButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-preset]')];

function renderLookup() {
  const ids = sequences[sequence.selectedIndex];
  const rows = lookupEmbeddings(ids);
  lookupResult.innerHTML = rows.map((row, index) => `
    <div class="lookup-row"><span class="position">第 ${index + 1} 个</span><b class="id-chip id-${ids[index]}">ID ${ids[index]}</b><span class="lookup-arrow">→</span><code>[${row.join(', ')}]</code></div>
  `).join('');
}

const origin = { x: 210, y: 190 };
const scale = 36;
const point = (v: Vector2) => ({ x: origin.x + v[0] * scale, y: origin.y - v[1] * scale });
const format = (value: number) => Number(value.toFixed(3)).toString();

// SVG 的坐标仅用于绘图，指标始终用原始向量计算。
document.querySelector('#grid')!.innerHTML = Array.from({ length: 9 }, (_, i) => i - 4).map((value) => {
  const { x, y } = point([value, value]);
  return `<path class="${value === 0 ? 'axis' : 'grid-line'}" d="M${x},${origin.y - 4 * scale} V${origin.y + 4 * scale} M${origin.x - 4 * scale},${y} H${origin.x + 4 * scale}" />
    ${value === 0 ? '' : `<text class="tick" x="${x}" y="${origin.y + 18}" text-anchor="middle">${value}</text><text class="tick" x="${origin.x - 10}" y="${y + 4}" text-anchor="end">${value}</text>`}`;
}).join('') + `<text class="axis-label" x="${origin.x - 14}" y="${origin.y + 19}">0</text><text class="axis-label" x="370" y="195">x</text><text class="axis-label" x="205" y="30">y</text>`;

function renderGeometry() {
  // 坐标来自有界滑块；无有效数值时不更新观察结果。
  const b: Vector2 = [bx.valueAsNumber, by.valueAsNumber];
  if (b.some((value) => !Number.isFinite(value) || value < -4 || value > 4)) return;
  const result = compareVectors(a, b);
  const pa = point(a);
  const pb = point(b);
  const samePoint = result.distance === 0;
  document.querySelector('#b-title')!.textContent = `B = (${b.join(', ')})`;
  document.querySelector('#bx-value')!.textContent = format(b[0]);
  document.querySelector('#by-value')!.textContent = format(b[1]);
  presetButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(presets[index].value.every((value, axis) => value === b[axis]))));

  document.querySelector('#vectors')!.innerHTML = `
    ${result.lengthB === 0 ? '' : `<path class="vector-b" d="M${origin.x},${origin.y} L${pb.x},${pb.y}" marker-end="url(#arrow-b)" />`}
    <path class="vector-a" d="M${origin.x},${origin.y} L${pa.x},${pa.y}" marker-end="url(#arrow-a)" />
    <path class="distance-line" d="M${pa.x},${pa.y} L${pb.x},${pb.y}" />
    <circle class="point-a" cx="${pa.x}" cy="${pa.y}" r="3" />
    <circle class="point-b" cx="${pb.x}" cy="${pb.y}" r="${samePoint ? 6 : 3}" />
    <text class="label-a" x="${pa.x + 12}" y="${pa.y + 16}">A</text>
    <text class="label-b" x="${pb.x + 12}" y="${pb.y - 9}">B</text>
  `;
  document.querySelector('#plot-description')!.textContent = `A 的坐标为 (1, 1)，B 的坐标为 (${b.join(', ')})。两个端点之间的欧氏距离为 ${format(result.distance)}。`;
  document.querySelector('#metrics')!.innerHTML = `
    <p class="lengths">长度 |A| = ${format(result.lengthA)} <span>|B| = ${format(result.lengthB)}</span></p>
    <dl class="metric-list">
      <div><dt>余弦相似度<small>比较方向</small></dt><dd>${result.cosine === null ? '<span class="undefined">未定义</span>' : format(result.cosine)}</dd></div>
      <div><dt>内积<small>同时受方向和长度影响</small></dt><dd>${format(result.dot)}</dd></div>
      <div><dt>欧氏距离<small>两个端点之间的距离</small></dt><dd>${format(result.distance)}</dd></div>
    </dl>
    <p class="observation">${result.cosine === null ? 'B 是零向量，没有方向。' : samePoint ? 'A 与 B 完全重合，距离为 0。' : Math.abs(result.cosine - 1) < 1e-10 ? '方向相同，余弦为 1；长度不同，距离不为 0。' : result.dot === 0 ? '两个向量相互垂直，余弦和内积都为 0。' : Math.abs(result.cosine + 1) < 1e-10 ? '两个向量方向相反，余弦为 −1。' : '拖动坐标，比较方向、长度和端点位置的变化。'}</p>
  `;
}

sequence.addEventListener('change', renderLookup);
bx.addEventListener('input', renderGeometry);
by.addEventListener('input', renderGeometry);
presetButtons.forEach((button, index) => button.addEventListener('click', () => {
  [bx.value, by.value] = presets[index].value.map(String);
  renderGeometry();
}));
renderLookup();
renderGeometry();
