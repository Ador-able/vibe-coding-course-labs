import assert from 'node:assert/strict';
import { readInputs } from './files.mjs';

export const fill = (template, values) => template.replace(/\{(goal|metadata|materials|previous|chapter|records|codebook|version)\}/g, (_, key) => {
  assert.ok(Object.hasOwn(values, key), `模板缺少 ${key}`); return values[key];
});
export function teaching(requireFrozen = true) {
  const { registry, files, texts } = readInputs(requireFrozen);
  const long = files['长文-完整三段与段落定位.json'];
  const labels = files['分类-十二条原文.json'];
  const logs = files['抽取与批量-十段原文.json'];
  const reference = files['抽取-独立参考.json'];
  const settings = files['非敏感固定设置.json'];
  assert.equal(settings.temperature, 0); assert.equal(settings.maxRetries, 0);
  assert.equal(settings.mapConcurrency, 3); assert.equal(settings.repairConcurrency, 2);
  assert.equal(long.chapters.length, 3); assert.equal(labels.records.length, 12); assert.equal(logs.records.length, 10);
  for (const chapter of long.chapters) assert.equal(chapter.paragraphs.map(p => p.text).join('\n'), chapter.body);
  assert.equal(files['模板-V2完整任务.txt'], files['模板-V1完整任务.txt'] + '\n' + files['模板-V2唯一增加段.txt']);
  const longChapter = n => long.chapters[n - 1].paragraphs.map(p => `[${p.sourceId}] ${p.text}`).join('\n\n');
  const longInput = (kind, values = {}) => ({ instructions: files['长文-instructions.txt'], prompt: fill(files[`长文-${kind}.txt`], { goal: files['长文-goal.txt'], metadata: long.metadata, ...values }) });
  function labelInput(stage, batchIndex) {
    const ids = labels.batches[batchIndex];
    const records = ids.map(id => labels.records.find(record => record.id === id));
    assert.ok(records.every(Boolean));
    const codebook = stage === 'discovery' ? '' : texts[`分类-口径-${stage}.json`];
    return { instructions: files['分类-共同规则.txt'], prompt: fill(files[stage === 'discovery' ? '分类-发现模板.txt' : '分类-重标模板.txt'], { records: JSON.stringify(records, null, 2), codebook, version: stage }) };
  }
  return { registry, files, settings, long, labels, logs, reference, longChapter, longInput, labelInput,
    extractionInput: { instructions: files['抽取-共同规则.txt'], prompt: files['抽取-完整八份任务.txt'] },
    templateInput: version => ({ instructions: files['抽取-共同规则.txt'], prompt: files[`模板-${version}完整任务.txt`] }) };
}
