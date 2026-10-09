import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 只核已有请求和结果原件，不联网，不重新生成。
const root = dirname(fileURLToPath(import.meta.url));
const run = join(root, 'runs/comparison-01');
const report = JSON.parse(await readFile(join(run, 'report.json'), 'utf8'));
const sha = b => createHash('sha256').update(b).digest('hex');
const checked = [];
assert.equal(report.requestCount, 8);
assert.equal(report.calls.length, 8);
assert.equal(report.error, null);
for (const record of report.calls) {
  const at = join(run, 'calls', record.id);
  const prompt = await readFile(join(at, 'prompt.txt'), 'utf8');
  const instructions = await readFile(join(at, 'instructions.txt'), 'utf8');
  const requestText = await readFile(join(at, 'request-body.json'), 'utf8');
  const responseText = await readFile(join(at, 'response-body.txt'), 'utf8');
  const output = await readFile(join(at, 'output.txt'), 'utf8');
  const request = JSON.parse(requestText), response = JSON.parse(responseText);
  assert.deepEqual(JSON.parse(await readFile(join(at, 'record.json'), 'utf8')), record);
  assert.equal(record.http.length, 1);
  assert.equal(record.http[0].requestBody, requestText);
  assert.equal(record.http[0].responseBody, responseText);
  assert.equal(record.http[0].status, 200);
  assert.equal(record.promptSha256, sha(prompt));
  assert.deepEqual(request.messages, [{ role: 'system', content: instructions }, { role: 'user', content: prompt }]);
  assert.equal(request.model, 'qwen-plus-2025-12-01');
  assert.equal(request.enable_thinking, false);
  assert.equal(request.max_tokens, 2048);
  assert.equal(request.temperature, 0);
  assert.equal(response.choices.length, 1);
  assert.equal(response.choices[0].message.content, output);
  assert.equal(output, record.result.text);
  assert.equal(response.choices[0].finish_reason, 'stop');
  assert.equal(record.result.finishReason, 'stop');
  assert.equal(response.usage.prompt_tokens, record.result.usage.inputTokens);
  assert.equal(response.usage.completion_tokens, record.result.usage.outputTokens);
  assert.equal(response.usage.total_tokens, record.result.usage.totalTokens);
  checked.push({ id: record.id, requestSha256: sha(requestText), responseSha256: sha(responseText),
    promptSha256: sha(prompt), outputSha256: sha(output), httpStatus: 200,
    finishReason: record.result.finishReason, responseModel: response.model,
    inputTokens: response.usage.prompt_tokens, outputTokens: response.usage.completion_tokens });
}
const inputs = JSON.parse(await readFile(join(root, 'inputs/materials.json'), 'utf8'));
for (const chapter of inputs.chapters) for (const p of chapter.paragraphs) assert.equal(chapter.body.slice(p.start, p.end), p.text);
for (const method of report.methods) assert.equal(await readFile(join(run, method.name + '.txt'), 'utf8'), method.output);
const maps = report.calls.filter(c => c.id.startsWith('02-map'));
const reducePrompt = await readFile(join(run, 'calls/03-reduce/prompt.txt'), 'utf8');
for (const c of maps) assert.ok(reducePrompt.includes(c.result.text));
for (const step of [2, 3]) {
  const previous = report.calls.find(c => c.id === `04-refine-${step - 1}`);
  const actual = await readFile(join(run, `calls/04-refine-${step}/prompt.txt`), 'utf8');
  assert.ok(actual.includes(previous.result.text));
}
const result = { passed: true, scope: '完整已有八次实际发送体/返回体/提示/结果和串联关系；不代表内容合格',
  calls: checked, paragraphs: inputs.chapters.reduce((n, c) => n + c.paragraphs.length, 0), modelCalls: 0 };
await writeFile(join(run, 'request-response-check.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ passed: result.passed, calls: checked.length, paragraphs: result.paragraphs, modelCalls: 0 }));
