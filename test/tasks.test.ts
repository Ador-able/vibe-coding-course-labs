import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createTasksRouter } from '../labs/requests/src/tasks/routes.ts';
import { checkOutput, totals } from '../labs/requests/src/tasks/checks.ts';
import { EDIT, type RunInput, type TaskRun } from '../labs/requests/src/tasks/contract.ts';

async function listen(server: Server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string'); return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server) { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }

test('样例只改变指定输入，成本核对复用同一初稿，失败与真实用量落盘', async () => {
  const received: { messages: { role: string; content: string }[] }[] = [];
  let finish = 'stop';
  const upstream = express().use(express.json({ limit: '1mb' })).post('/chat/completions', (req, res) => {
    received.push(req.body);
    res.json({ id: randomUUID(), object: 'chat.completion', created: 1, model: 'reported-model', choices: [{ index: 0, finish_reason: finish, message: { role: 'assistant', content: '# 章稿\n\n' + '攀爬'.repeat(405) } }], usage: { prompt_tokens: 200, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 30 } } });
  });
  const modelServer = createServer(upstream), baseUrl = await listen(modelServer);
  const directory = await mkdtemp(join(tmpdir(), 'tasks-test-'));
  const env = { API_BASE_URL: baseUrl, API_KEY: 'test-secret', MODEL: 'requested-model' };
  const app = express().use(express.json()).use('/api/tasks', createTasksRouter(env, resolve('lessons/chapter04/project'), directory));
  const server = createServer(app), origin = await listen(server);
  const post = async (input: RunInput) => {
    const response = await fetch(origin + '/api/tasks/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    return { response, run: await response.json() as TaskRun };
  };
  try {
    const batchId = randomUUID();
    const plain = await post({ lesson: 'examples', caseId: 'S1', method: 'none', batchId });
    const conflict = await post({ lesson: 'examples', caseId: 'S1', method: 'conflict', batchId, effort: 'low' });
    const firstInput = received[0].messages.filter(item => item.role === 'user').map(item => item.content).join('\n');
    const secondInput = received[1].messages.filter(item => item.role === 'user').map(item => item.content).join('\n');
    assert.ok(secondInput.startsWith(firstInput)); assert.ok(!firstInput.includes('<写法样例>')); assert.match(secondInput, /<写法样例>/);
    assert.equal(plain.run.request.responseModel, 'reported-model'); assert.equal(conflict.run.state, 'completed');
    assert.equal(JSON.parse(conflict.run.request.requestBody).reasoning_effort, 'low');
    assert.equal(plain.run.checks.hanCount, 810); assert.deepEqual(plain.run.judgments, {});
    const costBatch = randomUUID();
    const a = (await post({ lesson: 'cost', caseId: 'S2', method: 'A', batchId: costBatch })).run;
    const invalid = await post({ lesson: 'cost', caseId: 'S2', method: 'B', batchId: randomUUID(), parentId: a.id });
    assert.equal(invalid.response.status, 400); assert.equal(received.length, 3);
    const b = (await post({ lesson: 'cost', caseId: 'S2', method: 'B', batchId: costBatch, parentId: a.id })).run;
    assert.match(received.at(-1)!.messages.find(item => item.role === 'user')!.content, /<初稿>/);
    assert.ok(b.request.requestBody.includes(a.output.replaceAll('\n', '\\n')));
    assert.equal(totals([a, a, b]).calls, 2); assert.equal(totals([a, b]).input, 400); assert.equal(totals([a, b]).cached, 60); assert.equal(totals([a, b]).reasoning, null);
    finish = 'length';
    const failed = (await post({ lesson: 'goals', caseId: 'S1', method: 'none', batchId: randomUUID() })).run;
    assert.equal(failed.state, 'failed'); assert.ok(failed.output.length > 0); assert.equal(totals([failed]).input, 200);
    assert.equal(JSON.parse(await readFile(join(directory, `${failed.id}.json`), 'utf8')).state, 'failed');
    const stored = await (await fetch(origin + '/api/tasks/runs')).text(); assert.ok(!stored.includes('test-secret')); assert.ok(stored.includes(failed.id));
    const review = await fetch(origin + `/api/tasks/runs/${a.id}/judgments`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ 'fact-1': { decision: 'pass', evidence: '' } }) });
    assert.equal(review.status, 400);
    const judged = await fetch(origin + `/api/tasks/runs/${a.id}/judgments`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ 'fact-1': { decision: 'fail', evidence: '全文仅有“攀爬”重复，没有交代角色与身份。' } }) });
    assert.equal(judged.status, 200);
    assert.equal(JSON.parse(await readFile(join(directory, `${a.id}.json`), 'utf8')).judgments['fact-1'].decision, 'fail');
    finish = 'stop';
    await post({ lesson: 'evaluation', caseId: 'S3', method: 'A', batchId: randomUUID() });
    const baseline = received.at(-1)!.messages.find(item => item.role === 'user')!.content;
    await post({ lesson: 'evaluation', caseId: 'S3', method: 'B', batchId: randomUUID() });
    const revised = received.at(-1)!.messages.find(item => item.role === 'user')!.content;
    assert.ok(revised.startsWith(baseline)); assert.match(revised.slice(baseline.length), /写作前，先核对/);
    assert.match(baseline, /随墨大夫入谷/);
  } finally {
    await close(server); await close(modelServer);
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()))); await rm(directory, { recursive: true, force: true });
  }
});

test('局部反馈检查全文，字数相同不能掩盖越界修改', () => {
  const original = '# 选拔开端\n\n' + EDIT.before + '\n他继续攀爬。';
  assert.equal(checkOutput(original.replace(EDIT.before, EDIT.after), original).exactEdit, true);
  const changed = original.replace(EDIT.before, EDIT.after).replace('继续', '停止');
  assert.equal(checkOutput(changed, original).exactEdit, false);
});
