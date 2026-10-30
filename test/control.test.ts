import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../labs/requests/src/server.ts';
import type { ControlRun } from '../labs/requests/src/control/contract.ts';

async function listen(server: Server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); assert.ok(address && typeof address !== 'string'); return `http://127.0.0.1:${address.port}`; }
async function close(server: Server) { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }

test('三组控制保留实际预读与反馈，核对依据不泄漏；课堂重放不请求模型，取消不启动后续组', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'control-lab-')), project = join(directory, 'project'), records = join(directory, 'runs');
  await mkdir(project); await copyFile('lessons/chapter05/control/materials.json', join(project, 'materials.json'));
  const requests: any[] = []; let cancellationSeen!: () => void;
  const heldRequest = new Promise<void>(resolve => { cancellationSeen = resolve; });
  const upstream = createServer(express().use(express.json({ limit: '1mb' })).post('/chat/completions', (req, res) => {
    const input = req.body; requests.push(input);
    assert.equal(input.max_tokens, undefined); assert.equal(input.max_completion_tokens, undefined);
    assert.ok(!JSON.stringify(input).includes('应查证至少两项'));
    const prompt = input.messages.find((item: any) => item.role === 'user').content;
    if (prompt.includes('本轮测试取消')) { cancellationSeen(); return; }
    const results = input.messages.filter((item: any) => item.role === 'tool');
    const has = (id: string) => results.some((item: any) => item.tool_call_id === id);
    const result = (id: string) => JSON.parse(results.find((item: any) => item.tool_call_id === id).content);
    const call = (id: string, name: string, args: unknown) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
    const preloaded = prompt.includes('应用预先读取的资料'), tools = input.tools?.length;
    let calls: unknown[] = [], text: string | null = null;
    if (!tools) { assert.ok(preloaded); assert.match(prompt, /铜钥匙/); text = '仅取得基础要求与章稿，尚缺设定原文。'; }
    else if (has('D01') && has('D02')) { assert.match(result('D01').body, /铜钥匙只用于/); assert.match(result('D02').body, /一夜/); text = '铜钥匙开启主门与器物登记冲突；昨夜停钟与时序一致。'; }
    else if (has('search')) { assert.deepEqual(result('search').matches.map((item: any) => item.id), ['D01', 'D02']); calls = [call('D01', 'read_setting', { id: 'D01' }), call('D02', 'read_setting', { id: 'D02' })]; }
    else if (preloaded || has('chapter')) { if (!preloaded) assert.match(result('chapter').body, /铜钥匙/); calls = [call('search', 'search_settings', { query: '钥匙 停钟' })]; }
    else { assert.ok(!prompt.includes('铜钥匙')); calls = [call('work', 'read_work', {}), call('chapter', 'read_chapter', {})]; }
    res.json({ id: 'reply-' + requests.length, object: 'chat.completion', created: 1, model: 'test-model', choices: [{ index: 0, finish_reason: calls.length ? 'tool_calls' : 'stop', message: { role: 'assistant', content: text, ...(calls.length ? { tool_calls: calls } : {}) } }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
  }));
  const upstreamUrl = await listen(upstream), app = createApp({ API_BASE_URL: upstreamUrl, API_KEY: 'control-test-secret', MODEL: 'test-model' }, () => {}, undefined, {
    disclosure: { projectDirectory: project, recordDirectory: join(directory, 'disclosure') },
    tasks: { projectDirectory: project, recordDirectory: join(directory, 'tasks') },
    control: { projectDirectory: project, recordDirectory: records },
  });
  const server = createServer(app), origin = await listen(server);
  const getRun = async (id: string) => await (await fetch(`${origin}/api/control/runs/${id}`)).json() as ControlRun;
  const finish = async (initial: ControlRun) => { let value = initial; const deadline = Date.now() + 10000; while (value.state === 'running') { assert.ok(Date.now() < deadline, '对照未结束'); await new Promise(resolve => setTimeout(resolve, 20)); value = await getRun(value.id); } return value; };
  const start = async (task: string) => { const response = await fetch(origin + '/api/control/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenario: 'explore', variant: 'key', task }) }); assert.equal(response.status, 202); return await response.json() as ControlRun; };
  try {
    const material = await (await fetch(origin + '/api/control/materials')).json();
    assert.equal((await fetch(origin + '/api/control/classroom')).status, 404);
    const longTask = material.materials.tasks.explore + '\n' + '中'.repeat(6000);
    assert.ok(Buffer.byteLength(JSON.stringify({ scenario: 'explore', variant: 'key', task: longTask })) > 16 * 1024);
    const run = await finish(await start(longTask));
    assert.equal(run.state, 'completed', run.error); assert.equal(run.groups.length, 3);
    assert.deepEqual(run.groups.map(group => group.mode), ['workflow', 'agent', 'mixed']);
    assert.deepEqual(run.groups.map(group => group.provided.length), [2, 0, 2]);
    assert.deepEqual(run.groups.map(group => group.requests.length), [1, 4, 3]);
    assert.deepEqual(run.groups.map(group => group.seedDigest), [run.seedDigest, run.seedDigest, run.seedDigest]);
    for (const group of run.groups) {
      assert.equal(group.task, run.task); assert.equal(group.state, 'completed');
      for (const call of group.calls) {
        const echoed = group.requests.flatMap(request => JSON.parse(request.body).messages).find(message => message.role === 'tool' && message.tool_call_id === call.id);
        assert.ok(echoed); assert.deepEqual(JSON.parse(echoed.content), call.output);
      }
    }
    const exposedDefinitions = JSON.parse(run.groups[1].requests[0].body).tools.map((item: any) => item.function);
    assert.deepEqual(material.definitions, exposedDefinitions);
    assert.deepEqual(JSON.parse(await readFile(join(records, run.id, 'run.json'), 'utf8')), run);
    assert.ok(!JSON.stringify(run).includes('control-test-secret'));
    const classroom = { version: 1, runs: [run] }; await writeFile(join(project, 'classroom.json'), JSON.stringify(classroom)); const before = requests.length;
    assert.deepEqual(await (await fetch(origin + '/api/control/classroom')).json(), classroom); assert.equal(requests.length, before);
    const cancelled = await start('本轮测试取消'); await heldRequest;
    assert.equal((await fetch(`${origin}/api/control/runs/${cancelled.id}/cancel`, { method: 'POST' })).status, 200);
    const stopped = await finish(cancelled); assert.equal(stopped.state, 'cancelled'); assert.equal(stopped.groups.length, 1); assert.equal(stopped.groups[0].state, 'cancelled');
    assert.equal(stopped.groups[0].provided.length, 2); assert.equal(requests.length, before + 1);
    assert.equal(await readFile(join(project, 'materials.json'), 'utf8'), await readFile('lessons/chapter05/control/materials.json', 'utf8'));
  } finally { await app.closeTools(); await close(server); await close(upstream); assert.ok(resolve(directory).startsWith(resolve(tmpdir()))); await rm(directory, { recursive: true, force: true }); }
});
