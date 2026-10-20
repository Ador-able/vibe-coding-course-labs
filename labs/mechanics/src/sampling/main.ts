import { drawCount, initialCandidates, nucleusDistribution, sampleDistribution, seeds, temperatureDistribution, temperatures, topPs } from './model';
import './style.css';

let samples: ReturnType<typeof sampleDistribution> | null = null;
const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
const colors = ['#287f76', '#416fa3', '#a6782c'];

document.querySelector<HTMLElement>('#app')!.innerHTML = `
  <header>
    <span class="eyebrow">模型机制实验</span>
    <h1>生成参数怎样影响回答</h1>
    <p>固定同一个前缀和候选得分，依次观察温度、top-p 与抽样频率。</p>
    <p class="scope"><strong>人工分布</strong>得分由人预设，未经训练，不调用模型 API；候选概率不是任务正确率。</p>
    <p class="input-summary">固定前缀：<b>早餐喝</b><span>人工 logits：${initialCandidates.map(({ token, logit }) => `${token} ${logit}`).join(' · ')}</span></p>
  </header>

  <section aria-labelledby="temperature-title">
    <div class="section-heading"><h2 id="temperature-title"><span>1</span>温度改变概率分布</h2><label>用于后续步骤的温度 <select id="temperature"><option value="0.5">T = 0.5</option><option value="1" selected>T = 1</option><option value="2">T = 2</option></select></label></div>
    <div id="temperature-comparison" class="temperature-comparison"></div>
    <p class="note">三列来自同一时刻的候选。温度越低，当前高分项的概率越集中；温度越高，分布越平缓。</p>
  </section>

  <section aria-labelledby="nucleus-title">
    <div class="section-heading"><h2 id="nucleus-title"><span>2</span>top-p 保留累计概率足够的候选</h2><label>累计阈值 <select id="top-p"><option value="1">top-p = 1</option><option value="0.8" selected>top-p = 0.8</option><option value="0.5">top-p = 0.5</option></select></label></div>
    <p class="note" id="nucleus-source"></p>
    <div id="cumulative-plot"></div>
    <div id="nucleus-table" class="table-scroll"></div>
    <p id="nucleus-observation" class="observation"></p>
  </section>

  <section aria-labelledby="sampling-title">
    <div class="section-heading"><h2 id="sampling-title"><span>3</span>从同一分布抽样 100 次</h2><label>复现种子 <select id="seed">${seeds.map((seed) => `<option value="${seed}">${seed}</option>`).join('')}</select></label></div>
    <p class="note">每次都重新面对固定前缀“早餐喝”，只抽下一个 token；不是连续生成 100 个 token。</p>
    <div class="run-row"><button id="run-samples" type="button">运行 100 次抽样</button><p id="sample-parameters"></p></div>
    <div id="sample-results" aria-live="polite"></div>
  </section>

  <details class="inspection">
    <summary>查看计算公式、种子范围与原始结果</summary>
    <p>温度：pᵢ = softmax(logitᵢ / T)，本实验只提供 T &gt; 0。top-p 在温度之后执行：按概率降序累积，保留首次达到阈值的最小前缀，包含跨过阈值的那一项，再除以保留项的概率合计。</p>
    <p>抽样使用本地 32 位线性同余伪随机序列，并按累计概率选择候选；每次有放回抽样，分布保持不变。固定种子只复现本页算法，不保证云端模型可复现。修改参数或种子会清空旧结果；同一设置重复运行会复现同一组抽样。</p>
    <pre id="raw-results"></pre>
  </details>
`;

const temperatureSelect = document.querySelector<HTMLSelectElement>('#temperature')!;
const topPSelect = document.querySelector<HTMLSelectElement>('#top-p')!;
const seedSelect = document.querySelector<HTMLSelectElement>('#seed')!;
const settings = () => ({ temperature: temperatures[temperatureSelect.selectedIndex], topP: topPs[topPSelect.selectedIndex], seed: seeds[seedSelect.selectedIndex] });

function render() {
  const { temperature, topP, seed } = settings();
  const candidates = temperatureDistribution(temperature);
  const distribution = nucleusDistribution(candidates, topP);
  document.querySelector('#temperature-comparison')!.innerHTML = temperatures.map((value) => `<div class="temperature-column ${value === temperature ? 'selected-temperature' : ''}"><h3>T = ${value}${value === temperature ? '<span>当前选择</span>' : ''}</h3>${temperatureDistribution(value).map((row, index) => `<div class="probability-row"><span>${row.token}</span><div class="probability-track"><div style="width:${row.probability * 100}%;background:${colors[index]}"></div></div><b>${percent(row.probability)}</b></div>`).join('')}</div>`).join('');
  document.querySelector('#nucleus-source')!.textContent = `使用 T = ${temperature} 的分布，先按概率从大到小排列。下方虚线标出 top-p 阈值。`;
  document.querySelector('#cumulative-plot')!.innerHTML = `<div class="cumulative-label" style="left:${topP * 100}%;transform:translateX(${topP === 1 ? '-100%' : '-50%'})">阈值 ${percent(topP)}</div><div class="cumulative-track">${distribution.rows.map((row, index) => `<div style="width:${row.probability * 100}%;background:${row.retained ? colors[index] : '#e1e6e8'}" title="${row.token}：${percent(row.probability)}，${row.retained ? '保留' : '排除'}"></div>`).join('')}<div class="threshold" style="left:${topP * 100}%"></div></div><div class="scale"><span>0%</span><span>累计概率 100%</span></div>`;
  document.querySelector('#nucleus-table')!.innerHTML = `<table><thead><tr><th>候选</th><th>温度后的概率</th><th>累计概率</th><th>处理</th><th>重新归一化后的抽样概率</th></tr></thead><tbody>${distribution.rows.map((row, index) => {
    const previous = index === 0 ? 0 : distribution.rows[index - 1].cumulative;
    const crossing = topP < 1 && row.retained && previous < topP && row.cumulative >= topP;
    return `<tr class="${row.retained ? '' : 'excluded'}"><th><i class="color-dot" style="background:${colors[index]}"></i>${row.token}</th><td>${percent(row.probability)}</td><td>${percent(row.cumulative)}</td><td>${row.retained ? crossing ? '保留 · 达到阈值' : '保留' : '排除'}</td><td class="sampling-probability">${percent(row.sampleProbability)}</td></tr>`;
  }).join('')}</tbody></table>`;
  const retainedCount = distribution.rows.filter((row) => row.retained).length;
  document.querySelector('#nucleus-observation')!.textContent = topP === 1 ? 'top-p = 1：保留全部候选，不截断尾部。' : `保留前 ${retainedCount} 项，原概率合计 ${percent(distribution.retainedMass)}。跨过阈值的候选整项保留，再把保留项的概率重新归一化到 100%。`;
  document.querySelector('#sample-parameters')!.textContent = `T = ${temperature} · top-p = ${topP} · 种子 ${seed}`;
  document.querySelector('#sample-results')!.innerHTML = samples === null ? '<p class="empty">当前设置尚未抽样。</p>' : `
    <div class="table-scroll"><table class="sample-table"><thead><tr><th>候选</th><th>理论概率</th><th>抽中次数 / ${drawCount}</th><th>本次频率</th></tr></thead><tbody>${samples.rows.map((row, index) => `<tr><th>${row.token}</th><td>${percent(row.theoreticalProbability)}</td><td>${row.count}</td><td><div class="frequency-cell"><div class="frequency-track"><div style="width:${row.frequency * 100}%;background:${colors[index]}"></div><i style="left:${row.theoreticalProbability * 100}%"></i></div><b>${percent(row.frequency)}</b></div></td></tr>`).join('')}</tbody></table></div><p class="note">彩色柱是本次频率，竖线是理论概率。有限次抽样的频率不必刚好等于理论概率。</p>`;
  document.querySelector('#raw-results')!.textContent = JSON.stringify({ settings: { temperature, topP, seed }, initialCandidates, distribution, samples }, null, 2);
}

for (const select of [temperatureSelect, topPSelect, seedSelect]) select.addEventListener('change', () => {
  // 参数与结果成对呈现，避免把上一次抽样误当作当前设置的结果。
  samples = null;
  render();
});
document.querySelector('#run-samples')!.addEventListener('click', () => {
  const { temperature, topP, seed } = settings();
  samples = sampleDistribution(nucleusDistribution(temperatureDistribution(temperature), topP), seed);
  render();
});
render();
