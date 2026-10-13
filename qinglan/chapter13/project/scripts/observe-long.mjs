import { createRun, finishRun } from '../src/files.mjs';
import { teaching } from '../src/teaching.mjs';
import { modelRecorder } from '../src/model.mjs';

const material = teaching(), run = createRun('long-text', process.argv[2]), answer = modelRecorder(run, material.settings.calls.longText);
const output = record => { if (record.result?.finishReason !== 'stop') throw new Error(`${record.id} 未取得自然结束的返回，依赖步骤不再继续。`); return record.result.text; };
let error;
run.report.methods = [];
async function method(name, operation) {
  const begin = performance.now(), entry = { name, startedAt: new Date().toISOString() };
  run.report.methods.push(entry); run.save();
  try { await operation(); entry.outcome = 'returned'; }
  catch (cause) { error = cause; entry.outcome = 'failed'; entry.error = { name: cause.name, message: cause.message }; process.exitCode = 1; }
  finally { entry.finishedAt = new Date().toISOString(); entry.elapsedMs = performance.now() - begin; run.save(); }
}
await method('whole', async () => {
  await answer('01-whole', material.longInput('whole', { materials: [1, 2, 3].map(material.longChapter).join('\n\n') }), material.settings.maxOutputTokens.longText, ['C1', 'C2', 'C3']);
});
await method('map-reduce', async () => {
  const maps = await Promise.allSettled([1, 2, 3].map(n => answer(`02-map-${n}`, material.longInput('map', { materials: material.longChapter(n) }), material.settings.maxOutputTokens.longText, [`C${n}`])));
  const failed = maps.find(result => result.status === 'rejected'); if (failed) throw failed.reason;
  const notes = maps.map((result, index) => `[第${index + 1}章的实际笔记]\n${output(result.value)}`).join('\n\n');
  await answer('03-reduce', material.longInput('reduce', { materials: notes }), material.settings.maxOutputTokens.longText, ['02-map-1', '02-map-2', '02-map-3']);
});
await method('refine', async () => {
  let previous = output(await answer('04-refine-1', material.longInput('refine-first', { materials: material.longChapter(1) }), material.settings.maxOutputTokens.longText, ['C1']));
  for (const n of [2, 3]) previous = output(await answer(`04-refine-${n}`, material.longInput('refine-next', { chapter: n, materials: material.longChapter(n), previous }), material.settings.maxOutputTokens.longText, [`04-refine-${n - 1}`, `C${n}`]));
});
finishRun(run, error);
