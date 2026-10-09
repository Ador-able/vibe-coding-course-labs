import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const load = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const workflow = load('workflow.json');
const batch = load('inputs/完整两项目录输入.json');
const originals = load('inputs/原件清单.json');
const reference = load('inputs/既有三页正文参考.json');
assert.equal(workflow.nodes.length, 14);
assert.equal(new Set(workflow.nodes.map((n) => n.name)).size, 14);
assert.equal(new Set(workflow.nodes.map((n) => n.id)).size, 14);
assert.equal(workflow.active, false);
assert.equal(workflow.settings.binaryMode, 'separate');
assert.equal(Object.keys(workflow.pinData).length, 0);
assert.equal(batch.documents.length, 2);
assert.equal(new Set(batch.documents.map((d) => d.sourceId)).size, 2);
for (const entry of originals) {
  const raw = fs.readFileSync(path.join(root, entry.relativePath));
  assert.equal(raw.length, entry.bytes);
  assert.equal(createHash('sha256').update(raw).digest('hex'), entry.sha256);
  assert.equal(batch.documents.find((d) => d.sourceId === entry.sourceId)?.downloadUrl, 'http://host.docker.internal:4359/' + entry.publicName);
}
assert.deepEqual(reference.pages.map((p) => p.body.length), [338, 437, 284]);
assert.equal(reference.pages.map((p) => p.body).join('\n\n'), fs.readFileSync(path.join(root, 'files/chapter-three.txt'), 'utf8'));

const byName = new Map(workflow.nodes.map((n) => [n.name, n]));
for (const [source, connection] of Object.entries(workflow.connections)) {
  assert.ok(byName.has(source));
  for (const branch of connection.main) for (const target of branch) assert.ok(byName.has(target.node));
}
const download = byName.get('下载完整文件');
assert.equal(download.retryOnFail, false);
assert.equal(download.parameters.options.response.response.outputPropertyName, 'sourceFile');
assert.equal(download.parameters.options.response.response.fullResponse, true);
assert.equal(download.parameters.options.response.response.neverError, false);
assert.deepEqual(byName.get('提取PDF三页').parameters.options, { maxPages: 3, joinPages: false, keepSource: 'both' });
assert.deepEqual(byName.get('解码UTF8文本').parameters.options, { encoding: 'utf8', stripBOM: true, keepSource: 'both' });
const identity = byName.get('保留本项身份与下载').parameters;
assert.equal(identity.includeOtherFields, true);
assert.equal(identity.include, 'selected');
assert.equal(identity.options.stripBinary, false);
assert.ok(identity.jsonOutput.includes("$('逐项资料').item.json.document.sourceId"));
assert.ok(identity.jsonOutput.includes('fileName: $binary.sourceFile.fileName'));
assert.ok(!identity.jsonOutput.includes('.first()'));
assert.ok(!byName.get('准备本项完整文字').parameters.jsonOutput.includes('.first()'));
const separator = byName.get('准备本项完整文字').parameters.jsonOutput.match(/\.join\('([^']*)'\)/)?.[1];
assert.equal(separator, String.raw`\n\n`);
assert.deepEqual(workflow.connections['按实际MIME选择'].main.map((a) => a[0].node), ['提取PDF三页', '解码UTF8文本', '未支持类型停止']);
assert.deepEqual(workflow.connections['提取PDF三页'].main[0][0], { node: '合回两份解析资料', type: 'main', index: 0 });
assert.deepEqual(workflow.connections['解码UTF8文本'].main[0][0], { node: '合回两份解析资料', type: 'main', index: 1 });

const expressions = [];
function inspect(value, location) {
  if (typeof value === 'string' && value.startsWith('={{')) {
    assert.ok(value.trim().endsWith('}}'), location);
    const groups = value.match(/{{[\s\S]*?}}/g);
    assert.equal(groups?.length, 1, location);
    const code = value.slice(3, value.lastIndexOf('}}')).trim();
    // 只编译语法，函数从不调用，不构造或冒充节点输出。
    new Function('$json', '$binary', '$', 'return (' + code + ');');
    expressions.push(location);
  } else if (Array.isArray(value)) value.forEach((v, i) => inspect(v, location + '[' + i + ']'));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) inspect(v, location + '.' + k);
}
workflow.nodes.forEach((n) => {
  assert.ok(!/agent|lmChat|embedding|notification|email|code|executeCommand/i.test(n.type));
  assert.ok(!n.credentials);
  inspect(n.parameters, n.name + '.parameters');
});
process.stdout.write(JSON.stringify({ staticOnly: true, workflowName: workflow.name, nativeNodes: workflow.nodes.map(({ name, type, typeVersion }) => ({ name, type, typeVersion })), expressionsCompiledNotExecuted: expressions, originalFilesMatched: originals.map(({ sourceId, bytes, sha256 }) => ({ sourceId, bytes, sha256 })), teacherReferenceOnly: true, httpRequests: 0, parserExecutions: 0, modelRequests: 0, workflowCreations: 0 }, null, 2) + '\n');
