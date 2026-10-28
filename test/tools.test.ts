import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../lessons/chapter05/project/src/store.ts';
import { DEFAULT_TASK, type ToolsRun } from '../labs/requests/src/tools/contract.ts';
import { loadInitialWork, readBack, writingTools } from '../labs/requests/src/tools/workspace.ts';
import { createToolsRouter } from '../labs/requests/src/tools/routes.ts';

async function listen(server: Server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string'); return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server) { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
async function until<T>(read: () => Promise<T>, ready: (value: T) => boolean) {
  const deadline = Date.now() + 10000;
  while (true) { const value = await read(); if (ready(value)) return value; assert.ok(Date.now() < deadline, '本地工具流程没有按预期结束'); await new Promise(resolve => setTimeout(resolve, 20)); }
}

test('真实教学工作区独立持久保存，业务回执精简，旧正文与作品修订均拒绝', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tools-state-'));
  const initial = await loadInitialWork(resolve('lessons/chapter05/tools'));
  const firstPath = join(directory, 'first.sqlite'), secondPath = join(directory, 'second.sqlite');
  const first = new Store(firstPath), second = new Store(secondPath);
  try {
    first.init(initial.work); second.init(initial.work);
    const separate = writingTools(first, initial.work.id, 'separate'), combined = writingTools(second, initial.work.id, 'combined');
    const invoke = async (name: string, input: unknown) => await (separate[name].execute as Function)(input, { toolCallId: name, messages: [] });
    const context = await (combined.get_writing_context.execute as Function)({ chapterNumber: 1 }, { toolCallId: 'context', messages: [] });
    assert.deepEqual(context.work, await invoke('read_work', {}));
    assert.deepEqual(context.chapters, await invoke('list_chapters', {}));
    assert.deepEqual(context.current, await invoke('read_chapter', { chapterNumber: 1 }));
    const input = { chapterNumber: 1, expectedWorkRevision: 1, expectedChapterRevision: 0, title: '选拔开端', body: '韩立扶住竹子，继续沿竹林小路向上。' };
    const receipt = await invoke('save_draft', input);
    assert.deepEqual(receipt, { chapterNumber: 1, revision: 1, workRevision: 1, status: 'draft' });
    assert.equal(readBack(firstPath, initial.work.id)?.body, input.body);
    assert.equal(readBack(secondPath, initial.work.id), null);
    await assert.rejects(invoke('save_draft', { ...input, body: '覆盖旧稿' }), /正文已是 r1/);
    first.updateWork({ ...initial.work, purpose: '由人明确的新用途' }, 1);
    await assert.rejects(invoke('save_draft', { ...input, expectedChapterRevision: 1 }), /要求已是 r2/);
    assert.equal(readBack(firstPath, initial.work.id)?.body, input.body);
  } finally { first.close(); second.close(); assert.ok(resolve(directory).startsWith(resolve(tmpdir()))); await rm(directory, { recursive: true, force: true }); }
});

test('SDK 实际工具循环按调用标识回传，两条件使用同一初态，课堂载入不调用模型', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tools-api-'));
  const project = join(directory, 'project'), data = join(directory, 'runs');
  await mkdir(join(project, 'materials'), { recursive: true });
  await copyFile('lessons/chapter05/tools/materials/initial-work.json', join(project, 'materials/initial-work.json'));
  const requests: any[] = [];
  let interruption: 'none' | 'http' | 'cancel' = 'none';
  const upstream = createServer(express().use(express.json({ limit: '2mb' })).post('/chat/completions', (req, res) => {
    const input = req.body; requests.push(input);
    assert.equal(input.max_tokens, undefined); assert.equal(input.max_completion_tokens, undefined);
    assert.equal(input.messages.find((message: any) => message.role === 'user')?.content, DEFAULT_TASK);
    const results = input.messages.filter((message: any) => message.role === 'tool');
    const has = (id: string) => results.some((message: any) => message.tool_call_id === id);
    const calls = (entries: [string, string, unknown][]) => ({ content: null, tool_calls: entries.map(([id, name, args]) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } })) });
    let message: unknown, finish = 'tool_calls';
    if (has('saved') && interruption !== 'none') { if (interruption === 'http') res.status(503).json({ error: { message: '服务暂不可用' } }); return; }
    if (has('after')) { message = { content: '已保存第一章草稿，并读回核对。' }; finish = 'stop'; }
    else if (has('saved')) {
      const receipt = JSON.parse(results.find((message: any) => message.tool_call_id === 'saved').content);
      assert.equal(receipt.body, undefined); assert.equal(receipt.revision, 1);
      message = calls([['after', 'read_chapter', { chapterNumber: 1 }]]);
    } else if (results.length) message = calls([['saved', 'save_draft', { chapterNumber: 1, expectedWorkRevision: 1, expectedChapterRevision: 0, title: '选拔开端', body: '韩立扶住竹子，沿竹林里的小路继续前行。' }]]);
    else message = input.tools.some((item: any) => item.function.name === 'get_writing_context')
      ? calls([['context', 'get_writing_context', { chapterNumber: 1 }]])
      : calls([['work', 'read_work', {}], ['before', 'read_chapter', { chapterNumber: 1 }]]);
    res.json({ id: 'response-' + requests.length, object: 'chat.completion', created: 1, model: 'actual-test-model', choices: [{ index: 0, finish_reason: finish, message: { role: 'assistant', ...message as object } }],
      usage: { prompt_tokens: 100, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 10 }, completion_tokens_details: { reasoning_tokens: 5 } } });
  }));
  const baseUrl = await listen(upstream);
  const tools = createToolsRouter({ API_BASE_URL: baseUrl, API_KEY: 'test-secret', MODEL: 'test-model' }, project, data);
  const server = createServer(express().use(express.json()).use('/api/tools', tools.router)), origin = await listen(server);
  const read = async (id: string) => await (await fetch(`${origin}/api/tools/runs/${id}`)).json() as ToolsRun;
  const start = async (toolSet: ToolsRun['toolSet']) => {
    const response = await fetch(origin + '/api/tools/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task: DEFAULT_TASK, toolSet }) });
    assert.equal(response.status, 202); return await response.json() as ToolsRun;
  };
  try {
    assert.equal((await fetch(origin + '/api/tools/classroom')).status, 404);
    const materials = await (await fetch(origin + '/api/tools/materials')).json();
    const records: ToolsRun[] = [];
    for (const toolSet of ['separate', 'combined'] as const) {
      const initial = await start(toolSet), run = await until(() => read(initial.id), run => run.state !== 'running');
      assert.equal(run.state, 'completed', run.error); assert.equal(run.requests.length, 4);
      assert.deepEqual(materials.definitions[toolSet], JSON.parse(run.requests[0].body).tools.map((item: any) => item.function));
      assert.equal(run.readBack?.body, '韩立扶住竹子，沿竹林里的小路继续前行。');
      assert.deepEqual(run.usage, { input: 400, output: 120, cached: 40, reasoning: 20 });
      for (const entry of run.calls) {
        assert.equal(entry.state, 'completed');
        const echoed = run.requests.flatMap(request => JSON.parse(request.body).messages).find(message => message.role === 'tool' && message.tool_call_id === entry.id);
        assert.ok(echoed); assert.deepEqual(JSON.parse(echoed.content), entry.output);
      }
      const before = run.calls.find(call => call.name === (toolSet === 'combined' ? 'get_writing_context' : 'read_chapter'))!.output as any;
      assert.equal(toolSet === 'combined' ? before.current.chapter : before.chapter, null);
      assert.deepEqual(JSON.parse(await readFile(join(data, run.id, 'run.json'), 'utf8')), run);
      assert.ok(!JSON.stringify(run).includes('test-secret')); records.push(run);
    }
    assert.equal(records[0].seedDigest, records[1].seedDigest); assert.notEqual(records[0].id, records[1].id);
    await writeFile(join(project, 'classroom.json'), JSON.stringify(records));
    const previousCalls = requests.length;
    assert.deepEqual(await (await fetch(origin + '/api/tools/classroom')).json(), records); assert.equal(requests.length, previousCalls);
    for (const mode of ['http', 'cancel'] as const) {
      interruption = mode;
      const previous = requests.length, run = await start('combined');
      if (mode === 'cancel') {
        await until(() => read(run.id), value => value.calls.some(call => call.name === 'save_draft' && call.state === 'completed') && value.requests.length === 3);
        assert.equal((await fetch(`${origin}/api/tools/runs/${run.id}/cancel`, { method: 'POST' })).status, 200);
      }
      const stopped = await until(() => read(run.id), value => value.state !== 'running');
      assert.equal(stopped.state, mode === 'http' ? 'failed' : 'cancelled');
      assert.equal(stopped.readBack?.revision, 1); assert.ok(stopped.readBack?.body);
      assert.equal(requests.length - previous, 3); assert.equal(stopped.calls.find(call => call.name === 'save_draft')?.state, 'completed');
    }
  } finally { await tools.close(); await close(server); await close(upstream); assert.ok(resolve(directory).startsWith(resolve(tmpdir()))); await rm(directory, { recursive: true, force: true }); }
});
