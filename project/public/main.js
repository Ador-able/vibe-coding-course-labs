const $ = id => document.getElementById(id);
let observation = null, selectedAnswer = null, selectionRevision = 0;
const fetchText = async url => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`记录读取失败（HTTP ${response.status}）`);
  return response.text();
};
const clearSource = () => {
  window.answerSelection = null;
  $('source-title').textContent = '原文依据'; $('source-page').replaceChildren();
  $('source-status').textContent = '选择来源并查看依据。'; $('locator').textContent = '';
  $('file-download').hidden = true;
};
function renderAnswer() {
  selectionRevision++; selectedAnswer = observation.phases[$('answer').value]; clearSource();
  const isA = $('answer').value === 'A', updated = observation.phases.update.status === 'updated';
  $('question').textContent = isA ? 'AX-17什么时候检查，要付多少钱？80元是否需要另外相加？' : selectedAnswer.input.followUp;
  $('version').textContent = isA ? (updated ? '当时依据 v1，当前费用资料已更新。' : '当时依据 v1；本次更新尚未完成。')
    : '本轮依据当前检索返回的版本；历史回答用于理解追问。';
  $('answer-text').textContent = selectedAnswer.result?.text ?? '这轮没有得到可用回答，保留实际失败。';
  $('answer-state').textContent = selectedAnswer.result
    ? `回答已返回，内容待人工核对。结束原因：${selectedAnswer.result.finishReason}。`
    : `状态：${selectedAnswer.status}。${selectedAnswer.error?.message ?? ''}`;
  $('source').replaceChildren(...(selectedAnswer.input?.sources ?? []).map(source => {
    const option = document.createElement('option'); option.value = source.label;
    option.textContent = `[${source.label}] ${source.title} · ${source.version}`; return option;
  }));
  $('source').disabled = $('source').options.length === 0;
  $('locate').disabled = $('source').disabled;
  $('prompt-record').textContent = JSON.stringify({ input: selectedAnswer.input ?? null,
    labels: selectedAnswer.referenceLabels ?? null, note: '只检查标签有对应来源，不自动判断引用支持关系。' }, null, 2);
}
async function openSource() {
  const revision = selectionRevision;
  const source = selectedAnswer.input.sources.find(value => value.label === $('source').value);
  const url = 'materials/' + encodeURIComponent(source.locator.fileName);
  $('locate').disabled = true; $('source-status').textContent = '正在读取这轮来源对应的完整便签。';
  try {
    const fullText = await fetchText(url);
    if (revision !== selectionRevision) return;
    const { start, end } = source.locator.bodyRange;
    if (fullText.slice(start, end) !== source.text) throw new Error('完整文件与这轮来源快照不一致，不能当作该回答的依据。');
    $('source-title').textContent = `[${source.label}] ${source.title}`;
    $('source-status').textContent = `${source.locator.fileName} · 版本 ${source.version} · 课堂完整便签`;
    const paragraph = document.createElement('div'); paragraph.className = 'extracted-text'; paragraph.textContent = fullText;
    $('source-page').replaceChildren(paragraph);
    $('locator').textContent = `第 ${source.locator.lineRange[0]}—${source.locator.lineRange[1]} 行；正文范围 ${start}—${end}（UTF16）。本次显示完整 TXT，不是 PDF 页。`;
    $('file-download').href = url; $('file-download').download = source.locator.fileName; $('file-download').hidden = false;
    $('status').textContent = '完整便签已读回；请核对回答中的日期、金额、否定与未知。';
    window.answerSelection = { answer: $('answer').value, source, fullText };
  } catch (error) {
    if (revision !== selectionRevision) return;
    $('source-status').textContent = error.message; $('status').textContent = '来源未读回；已保存的回答仍保留。';
  } finally {
    if (revision === selectionRevision) $('locate').disabled = $('source').disabled;
  }
}
async function loadRecord() {
  $('retry').hidden = true; $('answer').disabled = true; $('source').disabled = true; $('locate').disabled = true;
  try {
    observation = JSON.parse(await fetchText('answer-observation.json'));
    const names = ['A', 'B'].filter(name => observation.phases[name].input);
    $('answer').replaceChildren(...names.map(name => {
      const option = document.createElement('option'); option.value = name;
      option.textContent = name === 'A' ? 'A · 更新前的问题' : 'B · 更新后的追问'; return option;
    }));
    $('raw-record').textContent = JSON.stringify(observation, null, 2);
    $('update-record').textContent = JSON.stringify({ update: observation.phases.update, ranking: observation.ranking ?? null }, null, 2);
    $('status').textContent = observation.completed ? '两轮调用记录已保存，回答与依据待人核对。'
      : `执行未完成，保留已返回部分。${observation.error?.message ?? ''}`;
    $('answer').disabled = names.length === 0;
    if (names.length) { $('answer').value = names.includes('B') ? 'B' : 'A'; renderAnswer(); }
    window.answerObservation = observation;
  } catch (error) {
    $('status').textContent = error.message; $('retry').hidden = false;
  }
}
$('answer').addEventListener('change', renderAnswer);
$('source').addEventListener('change', () => {
  selectionRevision++; clearSource(); $('locate').disabled = $('source').disabled;
});
$('locate-form').addEventListener('submit', event => { event.preventDefault(); openSource(); });
$('retry').addEventListener('click', loadRecord);
document.querySelectorAll('button[data-direction]').forEach(button => button.addEventListener('click', () => {
  document.body.dataset.direction = button.dataset.direction;
  document.querySelectorAll('button[data-direction]').forEach(value => value.setAttribute('aria-pressed', String(value === button)));
}));
loadRecord();
