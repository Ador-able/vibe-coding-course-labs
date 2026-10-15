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
// 片段正文必须逐字对应仓库共用原文，章号只定位本题所指部分。
const novel = load('inputs/凡人原文片段与段落定位.json');
const shared = load('../../chapter12/project/inputs/原文片段.json');
for (const fragment of novel.fragments) {
  assert.equal(fragment.body, shared.sources.find(s => s.id === fragment.id).text);
  assert.equal(sha(fragment.body), fragment.bodySha256);
  for (const p of fragment.paragraphs) assert.equal(fragment.body.slice(p.start, p.end), p.text);
}
const outline = load('inputs/凡人选拔与授课大纲.json');
const settings = load('inputs/凡人选拔与授课设定.json');
for (const event of outline.events) {
  const fragment = novel.fragments.find(s => s.id === event.sourceSegmentId);
  for (const quote of event.quotes) assert.ok(fragment.body.includes(quote));
}
for (const fact of settings.facts) assert.ok(novel.fragments.find(s => s.id === fact.sourceSegmentId).body.includes(fact.quote));
const text = fs.readFileSync(path.join(root, 'files/fanren-C05.txt'), 'utf8');
assert.equal(text.replace(/\n+/g, '\n'), novel.fragments.find(s => s.id === 'C05').body.replace(/\n+/g, '\n'));
const pages = load('inputs/PDF三页正文定位.json');
assert.equal(pages.kind, 'teacher-pagination-not-parser-output');
const count = novel.fragments.find(s => s.id === 'C05').paragraphs.length;
assert.deepEqual(pages.pageParagraphs.flatMap(([first,last]) => Array.from({length:last-first+1},(_,i)=>first+i)), Array.from({length:count},(_,i)=>i));
const feedback = load('inputs/教师反馈来源与边界.json');
for (const key of ['E01', 'E02']) {
  const task = load('inputs/feedback-' + key + '.json');
  assert.equal(task.feedback, feedback.feedbackTexts[key]);
  assert.equal(task.workId, 'fanren-xiuxianzhuan');
  assert.equal(task.chapterNumber, feedback.mapping[key].bookChapter);
  assert.equal(task.failTask, key === 'E02');
}
const batch = load('inputs/批次完整输入.json');
assert.deepEqual(batch.tasks.map(t => t.eventId), batch.selectedEventIds);
assert.deepEqual(batch.tasks.map(t => t.failTask), [true, false, 'false']);
for (const task of batch.tasks) {
  const key = task.eventId.split('-').at(-1), mapping = feedback.mapping[key];
  assert.equal(task.feedback, feedback.feedbackTexts[key]);
  assert.equal(task.chapterNumber, mapping.bookChapter);
  assert.equal(task.referenceMaterials.sourceSegmentId, mapping.sourceSegmentId);
  assert.equal(task.referenceMaterials.completeOriginal, novel.fragments.find(s => s.id === mapping.sourceSegmentId).body);
  assert.deepEqual(task.referenceMaterials.outline, outline.events.find(s => s.sourceSegmentId === mapping.sourceSegmentId));
  assert.deepEqual(task.referenceMaterials.settings, settings.facts.filter(s => s.sourceSegmentId === mapping.sourceSegmentId));
}
const tables = load('inputs/五份建表参数.json');
assert.equal(tables.length, 5);
assert.equal(new Set(tables.map(t => t.request.name)).size, 5);
assert.deepEqual(tables[0].request.columns, tables[2].request.columns);
assert.deepEqual(tables[1].request.columns, tables[3].request.columns);
const fixed = load('inputs/非敏感固定设置.json');
assert.equal(fixed.objects.workflowCount, 4);
for (const key of ['modelRequestBudget','googleRequestBudget','invitationBudget','emailBudget','receiptCardExecutions']) assert.equal(fixed[key], 0);
assert.equal(fixed.webhookPostBudget, 7);
const ledger = load('inputs/执行请求清单.json');
assert.equal(ledger.webhookPosts.length, fixed.webhookPostBudget);
for (const request of ledger.webhookPosts) {
  const raw = fs.readFileSync(path.join(root, request.inputPath));
  assert.equal(sha(raw), request.inputSha256);
  const input = JSON.parse(raw);
  if(request.command === 'files') assert.equal(input.documents.length, request.splitItems);
  else if(request.command === 'branch') assert.equal(input.tasks.length, request.splitItems);
  else assert.equal(request.splitItems, 1);
}
const workflows = ['feedback/workflow.template.json', 'files/workflow.json', 'branch/parent.template.json', 'branch/child.template.json'].map(p => load('workflows/' + p));
const expressions = [];
function inspect(value, location) {
  if (typeof value === 'string' && value.startsWith('={{')) {
    assert.ok(value.endsWith('}}'), location);
    // 只编译语法，不构造节点结果或执行业务。
    new Function('$json', '$binary', '$', '$input', '$execution', 'return (' + value.slice(3, -2).trim() + ');');
    expressions.push(location);
  } else if (Array.isArray(value)) value.forEach((v,i)=>inspect(v,location+'['+i+']'));
  else if(value && typeof value==='object') for(const [k,v] of Object.entries(value)) inspect(v,location+'.'+k);
}
for(const workflow of workflows) {
  assert.ok(!workflow.active);
  assert.deepEqual(workflow.pinData, {});
  const names = new Set(workflow.nodes.map(n=>n.name));
  assert.equal(names.size, workflow.nodes.length);
  assert.equal(new Set(workflow.nodes.map(n=>n.id)).size, workflow.nodes.length);
  for(const node of workflow.nodes) {
    assert.ok(!node.credentials);
    assert.ok(!/agent|lmChat|embedding|email|google|code|executeCommand/i.test(node.type));
    assert.ok(!node.retryOnFail);
    inspect(node.parameters,workflow.name+'/'+node.name);
  }
  for(const [name,outputs] of Object.entries(workflow.connections)) {
    assert.ok(names.has(name));
    for(const branch of outputs.main) for(const output of branch) assert.ok(names.has(output.node));
  }
}
const filesWorkflow = workflows[1];
const prepare = filesWorkflow.nodes.find(n=>n.name==='准备本项完整文字').parameters.jsonOutput;
assert.ok(prepare.includes('韩立和张铁'));
assert.ok(filesWorkflow.nodes.find(n=>n.name==='保留本项身份与下载').parameters.jsonOutput.includes("$('逐项资料').item.json.document.sourceId"));
assert.deepEqual(filesWorkflow.nodes.find(n=>n.name==='提取PDF三页').parameters.options,{maxPages:3,joinPages:false,keepSource:'both'});
const card = load('inputs/接收者验收卡.json');
assert.equal(card.completed, false);
assert.ok(card.steps.every(s=>s.state==='未检查'));
assert.equal(card.input.feedback, feedback.feedbackTexts.E01);
assert.equal(card.originalReferences.sourceSegmentId, 'C04');
console.log(JSON.stringify({staticOnly:true,frozenFiles:frozen.files.length,originalFragments:novel.fragments.map(s=>s.id),nativeWorkflowNodes:workflows.map(w=>w.nodes.length),expressionsCompiledNotExecuted:expressions.length,tables:5,webhookPostBudget:ledger.webhookPosts.length,currentBatchItems:batch.tasks.length,modelRequests:0,businessRequests:0,n8nParserExecutions:0},null,2));
