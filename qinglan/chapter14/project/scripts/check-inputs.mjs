import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const load = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const sha = raw => createHash('sha256').update(raw).digest('hex');
const frozen = load('inputs/输入冻结清单.json');
for (const file of frozen.files) {
  const raw = fs.readFileSync(path.join(root, file.path));
  assert.equal(raw.length, file.bytes, file.path);
  assert.equal(sha(raw), file.sha256, file.path);
}
const source = load('inputs/长文-完整三章与段落定位.json');
assert.deepEqual(source.chapters.map(c => c.paragraphs.length), [23, 30, 29]);
for (const c of source.chapters) assert.equal(c.body, c.paragraphs.map(p => p.text).join('\n\n'));
assert.equal(fs.readFileSync(path.join(root, 'files/chapter-three.txt'), 'utf8'), source.chapters[2].body);
assert.equal(load('inputs/PDF三页正文定位.json').kind, 'teacher-pagination-not-parser-output');
const feedback = load('inputs/教师反馈来源与边界.json');
for (const key of ['E01', 'E02']) {
  const task = load(`inputs/feedback-${key}.json`);
  assert.equal(task.feedback, feedback.feedbackTexts[key]);
  assert.equal(task.workId, 'qinglan-xiuxianlu');
  assert.equal(task.failTask, key === 'E02');
}
const batch = load('inputs/批次完整输入.json');
assert.deepEqual(batch.tasks.map(t => t.eventId), batch.selectedEventIds);
assert.deepEqual(batch.tasks.map(t => t.failTask), [true, false, 'false']);
assert.deepEqual(batch.tasks.map(t => t.feedback), ['E02', 'E01', 'E03'].map(k => feedback.feedbackTexts[k]));
const tables = load('inputs/五份建表参数.json');
assert.equal(tables.length, 5);
assert.equal(new Set(tables.map(t => t.request.name)).size, 5);
assert.deepEqual(tables[0].request.columns, tables[2].request.columns);
assert.deepEqual(tables[1].request.columns, tables[3].request.columns);
const settings = load('inputs/非敏感固定设置.json');
assert.equal(settings.objects.tableCount, 5);
assert.equal(settings.objects.workflowCount, 4);
assert.equal(settings.modelRequestBudget, 0);
assert.equal(settings.googleRequestBudget, 0);
assert.equal(settings.receiptCardExecutions, 0);
const workflows = ['feedback/workflow.template.json', 'files/workflow.json', 'branch/parent.template.json', 'branch/child.template.json'].map(p => load('workflows/' + p));
const expressions = [];
function inspect(value, location) {
  if (typeof value === 'string' && value.startsWith('={{')) {
    assert.ok(value.endsWith('}}'), location);
    // 编译原生表达式语法，不构造或执行节点结果。
    new Function('$json', '$binary', '$', '$input', '$execution', 'return (' + value.slice(3, -2).trim() + ');');
    expressions.push(location);
  } else if (Array.isArray(value)) value.forEach((v, i) => inspect(v, location + '[' + i + ']'));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) inspect(v, location + '.' + k);
}
for (const workflow of workflows) {
  assert.ok(!workflow.active);
  assert.deepEqual(workflow.pinData, {});
  const names = new Set(workflow.nodes.map(n => n.name));
  assert.equal(names.size, workflow.nodes.length);
  assert.equal(new Set(workflow.nodes.map(n => n.id)).size, workflow.nodes.length);
  for (const node of workflow.nodes) {
    assert.ok(!node.credentials);
    assert.ok(!/agent|lmChat|embedding|email|google|code|executeCommand/i.test(node.type));
    inspect(node.parameters, workflow.name + '/' + node.name);
  }
  for (const [name, outputs] of Object.entries(workflow.connections)) {
    assert.ok(names.has(name));
    for (const branch of outputs.main) for (const output of branch) assert.ok(names.has(output.node));
  }
}
const filesWorkflow = workflows[1];
const prepare = filesWorkflow.nodes.find(n => n.name === '准备本项完整文字').parameters.jsonOutput;
assert.ok(prepare.includes('说明林青已经'));
assert.ok(!prepare.includes('说明林澈已经'));
assert.ok(filesWorkflow.nodes.find(n => n.name === '保留本项身份与下载').parameters.jsonOutput.includes("$('逐项资料').item.json.document.sourceId"));
assert.deepEqual(filesWorkflow.nodes.find(n => n.name === '提取PDF三页').parameters.options, { maxPages: 3, joinPages: false, keepSource: 'both' });
const card = load('inputs/接收者验收卡.json');
assert.equal(card.completed, false);
const csv = fs.readFileSync(path.join(root, card.previousChapter.extractionCsv.path));
assert.equal(csv.length, card.previousChapter.extractionCsv.bytes);
assert.equal(sha(csv), card.previousChapter.extractionCsv.sha256);
process.stdout.write(JSON.stringify({ staticOnly: true, frozenFiles: frozen.files.length, originalParagraphs: 82, nativeWorkflowNodes: workflows.map(w => w.nodes.length), expressionsCompiledNotExecuted: expressions.length, tables: 5, currentBatchItems: 3, previousActualCsvMatched: true, modelRequests: 0, businessRequests: 0, n8nParserExecutions: 0 }, null, 2) + '\n');
