import path from 'node:path';
import { newRun, loadMaterials, saveRun } from '../src/materials.mjs';
import { checkSource, checkTeaching } from '../src/frozen.mjs';
import { recorder } from '../src/model-records.mjs';

checkSource(); checkTeaching(); const material = loadMaterials(); const run = newRun(process.argv[2]);
const report = { ...run, directory: undefined, source: '真实共用向量服务', inputFiles: material.inputFiles, settings: material.settings, actualHttpRequests: 0, textTasks: 0, embeddingTasks: 0,
  processing: 'SDK输入不增加指令前缀，不在收到后主动归一化；服务内部处理与底层模型未知。', completed: false };
const record = recorder(run, report); report.baseURL = record.config.baseUrl; report.model = record.config.embeddingModel;
report.phase = record.phase({ values: material.values }); record.save();
const vectors = await record.embeddings(report.phase);
if (vectors) { report.embeddings = vectors; report.completed = true; }
report.finishedAt = new Date().toISOString(); record.save();
saveRun(run, report, 'embeddings.json');
console.log(JSON.stringify({ runId: run.runId, record: path.join(run.directory, 'report.json'), completed: report.completed, embeddingInputs: material.values.length, actualHttpRequests: report.actualHttpRequests, textTasks: 0 }));
if (!report.completed) process.exitCode = 1;
