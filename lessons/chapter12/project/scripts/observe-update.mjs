import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root, loadFrozen, newRun, saveRun, readJson, writeJson, sha256 } from '../src/materials.mjs';
import { checkSource, checkTeaching } from '../src/frozen.mjs';
import { readSharedConfig } from '../src/config.mjs';
import { recorder, sourceText, describeError } from '../src/model-records.mjs';
import { replaceCurrentSource, rankCurrentSource } from '../src/update-index.mjs';

checkSource(); checkTeaching(); const frozen = loadFrozen('update'); const material = frozen.read('material.json');
const config = readSharedConfig('embedding');
assert.equal(config.embeddingModel, material.previousEmbeddings.model, '共用向量模型已改变，必须重建整个向量集合。');
assert.equal(config.baseUrl, material.previousEmbeddings.baseURL, '新增向量须沿用原服务。');
const run = newRun(process.argv[2]);
const report = { ...run, directory: undefined, inputFiles: frozen.files, phases: {}, actualHttpRequests: 0, textTasks: 0, embeddingTasks: 0, completed: false,
  executionScope: '两次独立文字任务、一次新增向量任务；SDK内部自然拆分按实际fetch计数，无自动重试。', semanticReview: 'needs_human' };
const writer = recorder(run, report); report.baseURL = config.baseUrl; report.model = writer.config.model; report.embeddingModel = config.embeddingModel;
try {
  const promptA = `问题：\n${material.query.questionA}\n\n本轮实际检索的完整来源：\n${material.prompts.sourcesA.map(sourceText).join('\n\n')}`;
  report.phases.A = writer.phase({ system: material.prompts.system, question: material.query.questionA, sources: material.prompts.sourcesA, messages: [{ role: 'user', content: promptA }] });
  const answerA = await writer.answer(report.phases.A); assert(answerA?.text.trim(), 'A没有可用正文，停止后续。'); assert.notEqual(answerA.finishReason, 'length', 'A受输出限制，停止接续。');
  report.phases.embedding = writer.phase({ values: material.newValues }); writer.save();
  const newEmbeddings = await writer.embeddings(report.phases.embedding); assert(newEmbeddings, '新增向量任务未完成。');
  assert.equal(report.phases.embedding.dimensions, material.settings.dimensions, '新增向量维度与原向量不同。');
  report.newEmbeddings = newEmbeddings; report.phases.update = {}; writer.save();
  const index = await replaceCurrentSource(material, newEmbeddings, report.phases.update, writer.save);
  const persisted = { model: config.embeddingModel, baseURL: config.baseUrl, dimensions: material.settings.dimensions, current: index.current, currentVectors: index.currentVectors,
    archive: report.phases.update.archive, currentDocumentVersions: material.action.currentDocumentVersions };
  const savedPath = path.join(run.directory, 'current-index.json'); writeJson(savedPath, persisted);
  const loaded = readJson(savedPath); assert.deepEqual(loaded, persisted);
  const bytes = fs.readFileSync(savedPath); report.phases.update.persisted = { name: 'current-index.json', bytes: bytes.length, sha256: sha256(bytes), independentReadbackSame: true }; writer.save();
  report.ranking = await rankCurrentSource(material, index, newEmbeddings[1]); writer.save();
  const sourcesB = report.ranking.fusion.all.slice(0, 2).map(row => row.document); assert(sourcesB.length, '当前候选为空，不请求B。');
  const promptB = `追问：\n${material.query.followUp}\n\n本轮实际检索的完整当前来源：\n${sourcesB.map(sourceText).join('\n\n')}`;
  report.phases.B = writer.phase({ system: material.prompts.system, question: material.query.followUp, independentQuery: material.query.independentQuery, queryAuthor: material.query.queryAuthor, sources: sourcesB,
    messages: [{ role: 'user', content: material.query.questionA }, { role: 'assistant', content: answerA.text }, { role: 'user', content: promptB }] });
  const answerB = await writer.answer(report.phases.B); report.completed = Boolean(answerB);
} catch (error) { report.error = describeError(error); }
report.finishedAt = new Date().toISOString(); writer.save(); saveRun(run, report, 'update.json');
console.log(JSON.stringify({ runId: run.runId, record: path.join(run.directory, 'report.json'), completed: report.completed, textTasks: report.textTasks, embeddingTasks: report.embeddingTasks,
  actualHttpRequests: report.actualHttpRequests, textHttpRequests: (report.phases.A?.actualHttpRequests || 0) + (report.phases.B?.actualHttpRequests || 0), embeddingHttpRequests: report.phases.embedding?.actualHttpRequests || 0 }));
if (!report.completed) process.exitCode = 1;
