import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = dirname(fileURLToPath(import.meta.url));
const runDir = resolve(root, process.argv[2] ?? 'runs/extract-01');
const report = JSON.parse(await readFile(join(runDir, 'report.json'), 'utf8'));
const request = JSON.parse(await readFile(join(runDir, 'request-body.json'), 'utf8'));
const response = JSON.parse(await readFile(join(runDir, 'response-body.txt'), 'utf8'));
const output = await readFile(join(runDir, 'output.txt'), 'utf8');
const sha = x => createHash('sha256').update(x).digest('hex');
assert.equal(report.requestCount, 1);
assert.equal(report.http.length, 1);
assert.equal(report.http[0].status, 200);
assert.equal(report.error, null);
assert.equal(request.model, report.settings.modelId);
assert.equal(request.temperature, 0);
assert.equal(request.max_tokens, 6144);
assert.equal(request.enable_thinking, false);
// 这个固定适配器在普通生成时省略 stream；按实际发送对象核对。
assert.equal(request.stream, undefined);
assert.equal(request.stream_options, undefined);
assert.deepEqual(request.messages, [
 { role: 'system', content: await readFile(join(root,'prompts/instructions.txt'),'utf8') },
 { role: 'user', content: await readFile(join(root,'prompts/task.txt'),'utf8') }
]);
assert.equal(request.tools, undefined);
assert.equal(report.promptSHA256, sha(request.messages[1].content));
assert.equal(report.sourceSHA256, sha(await readFile(join(root,'inputs/reports.json'),'utf8')));
assert.equal(report.referenceSHA256, sha(await readFile(join(root,'inputs/teacher-reference.json'),'utf8')));
assert.equal(report.http[0].requestBody, await readFile(join(runDir,'request-body.json'),'utf8'));
assert.equal(report.http[0].responseBody, await readFile(join(runDir,'response-body.txt'),'utf8'));
assert.equal(response.choices[0].message.content, output);
assert.equal(report.result.text, output);
assert.equal(report.result.rawFinishReason, response.choices[0].finish_reason);
assert.equal(report.result.usage.inputTokens, response.usage.prompt_tokens);
assert.equal(report.result.usage.outputTokens, response.usage.completion_tokens);
assert.equal(report.result.usage.totalTokens, response.usage.total_tokens);
const result = { passed: true, checks: '一次真实发送/原返回/SDK用量/全文与固定输入逐项相同；不是内容通过', requestCount: report.requestCount, status: report.http[0].status, finishReason: report.result.finishReason, rawUsage: response.usage, scope: '仅读既有请求，无新模型调用' };
await writeFile(join(root,'runs/request-check.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));

