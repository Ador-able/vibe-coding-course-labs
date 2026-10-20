import './style.css';
import { analyze, loadTokenizer, models, presets } from './tokenization.ts';
import { renderResult } from './render.ts';

document.querySelector<HTMLElement>('#app')!.innerHTML = `
  <header><span class="eyebrow">模型的工作方式</span><h1>文本怎样变成 token</h1><p>输入同一段文本，看看两种分词规则怎样拆分，以及它们使用的 token 编号。</p></header>
  <form id="lab-form">
    <label for="input">输入文本</label>
    <textarea id="input" rows="2" maxlength="2000"></textarea>
    <div class="presets" aria-label="示例文本"></div>
    <div class="controls"><select id="model" aria-label="选择分词器"></select><button class="primary" type="submit">查看分词</button></div>
  </form>
  <p id="status" role="status"></p>
  <section id="results" aria-live="polite"></section>
  <footer>仅分词，不运行模型。使用官方公开配置；未套用聊天模板，也未自动添加特殊 token。结果不等于在线服务的账单用量。</footer>`;

const form = document.querySelector<HTMLFormElement>('#lab-form')!;
const input = document.querySelector<HTMLTextAreaElement>('#input')!;
const select = document.querySelector<HTMLSelectElement>('#model')!;
const submit = document.querySelector<HTMLButtonElement>('.primary')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const results = document.querySelector<HTMLElement>('#results')!;
input.value = presets[0].text;
select.replaceChildren(new Option('对比两种分词器', 'compare'), ...models.map((model) => new Option(model.name, model.key)));

function clearResult() {
  results.replaceChildren();
  status.textContent = '';
}
const presetButtons = presets.map((preset) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = preset.name;
  button.addEventListener('click', () => {
    input.value = preset.text;
    clearResult();
    input.focus();
  });
  return button;
});
document.querySelector('.presets')!.replaceChildren(...presetButtons);
input.addEventListener('input', clearResult);
select.addEventListener('change', clearResult);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submit.disabled) return;
  for (const control of [input, select, submit, ...presetButtons]) control.disabled = true;
  clearResult();
  status.textContent = '正在读取本地分词器……';
  try {
    const selected = select.value === 'compare' ? models : models.filter((item) => item.key === select.value);
    const tokenizers = await Promise.all(selected.map((model) => loadTokenizer(model.key)));
    const cards = selected.map((model, index) => renderResult(model, analyze(input.value, tokenizers[index])));
    results.className = cards.length === 2 ? 'comparison' : '';
    results.replaceChildren(...cards);
    status.textContent = '';
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : '分词失败，请重试。';
  } finally {
    for (const control of [input, select, submit, ...presetButtons]) control.disabled = false;
  }
});
