import path from 'node:path';
import { root, readJson, newRun, saveRun } from '../src/materials.mjs';
import { checkSource, checkTeaching } from '../src/frozen.mjs';
import { recorder } from '../src/model-records.mjs';

checkSource(); checkTeaching(); const run = newRun(process.argv[2]);
const chunks = readJson(path.join(root, 'public/records/chunks.json')); const rules = readJson(path.join(root, 'inputs/实验规则.json'));
const report = { ...run, directory: undefined, sourceChunkRunId: chunks.runId, actualHttpRequests: 0, textTasks: 0, embeddingTasks: 0, records: [], options: rules.model };
const writer = recorder(run, report); report.baseURL = writer.config.baseUrl; report.model = writer.config.model;
for (const method of chunks.methods) {
  const selected = method.retrievals.find(row => row.term === '卡住');
  const input = { system: rules.chunkSystem, question: rules.chunkQuestion, context: selected.context,
    messages: [{ role: 'user', content: `资料：\n${selected.context}\n\n问题：\n${rules.chunkQuestion}` }] };
  const record = writer.phase(input); Object.assign(record, { methodId: method.condition.id, term: selected.term, selected }); report.records.push(record); writer.save();
  await writer.answer(record);
}
report.completed = report.records.every(record => record.status === 'returned'); report.finishedAt = new Date().toISOString(); writer.save();
saveRun(run, report, 'chunk-answers.json');
console.log(JSON.stringify({ runId: run.runId, record: path.join(run.directory, 'report.json'), completed: report.completed, textTasks: report.textTasks, actualHttpRequests: report.actualHttpRequests, embeddingTasks: 0 }));
if (!report.completed) process.exitCode = 1;
