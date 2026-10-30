import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../lessons/chapter05/project/src/store.ts';
import { DEFAULT_TASK, type FeedbackRun } from '../labs/requests/src/tool-results/contract.ts';
import { loadMaterials } from '../labs/requests/src/tool-results/workspace.ts';
import { createToolResultsRouter } from '../labs/requests/src/tool-results/routes.ts';

async function listen(server: Server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); assert.ok(address && typeof address !== 'string'); return `http://127.0.0.1:${address.port}`; }
async function close(server: Server) { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }

test('编辑后的前文通过真实工具反馈进入后续请求，旧依据拒绝后保留原稿，保存与课堂读回一致', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tool-results-')), project = join(directory, 'project'), data = join(directory, 'runs');
  await mkdir(join(project, 'materials'), { recursive: true });
  for (const name of ['work.json', 'predecessor.json']) await copyFile(`lessons/chapter05/tool-results/materials/${name}`, join(project, 'materials', name));
  const material = await loadMaterials(project), predecessor = { ...material.chapters.current, body: material.chapters.current.body + '\n\n他先停下来揉了揉左手，才重新握紧竹子。' };
  const requests: any[] = [];
  const upstream = createServer(express().use(express.json({ limit: '1mb' })).post('/chat/completions', (req, res) => {
    const input = req.body; requests.push(input);
    assert.equal(input.max_tokens, undefined); assert.equal(input.max_completion_tokens, undefined);
    const results = input.messages.filter((item: any) => item.role === 'tool'), has = (id: string) => results.some((item: any) => item.tool_call_id === id);
    const result = (id: string) => JSON.parse(results.find((item: any) => item.tool_call_id === id).content);
    const call = (id: string, name: string, args: unknown) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
    const save = (id: string, revision: number) => call(id, 'save_draft', { chapterNumber: 2, expectedWorkRevision: 1, expectedChapterRevision: 0, expectedPreviousRevisions: [{ number: 1, revision }], title: '岩壁前的坚持', body: '韩立揉过的左手仍在发疼，他试探着抓住岩壁上的石棱。' });
    let calls: unknown[] = [], text: string | null = null;
    if (has('read-back')) { assert.equal(result('read-back').chapter.body, result('saved').body ?? '韩立揉过的左手仍在发疼，他试探着抓住岩壁上的石棱。'); text = '第二章已保存为草稿，并读回。'; }
    else if (has('saved')) calls = [call('read-back', 'read_chapter', { chapterNumber: 2 })];
    else if (has('reread')) { assert.equal(result('reread').chapter.body, predecessor.body); calls = [save('saved', result('reread').chapterRevision)]; }
    else if (has('old-save')) { assert.match(results.find((item: any) => item.tool_call_id === 'old-save').content, /已经是 r2|读取当前正文/); calls = [call('reread', 'read_chapter', { chapterNumber: 1 })]; }
    else if (has('previous')) { assert.equal(result('previous').chapter.body, predecessor.body); assert.equal(result('target').chapter, null); calls = [save('old-save', 1)]; }
    else calls = [call('work', 'read_work', {}), call('previous', 'read_chapter', { chapterNumber: 1 }), call('target', 'read_chapter', { chapterNumber: 2 })];
    res.json({ id: 'reply-' + requests.length, object: 'chat.completion', created: 1, model: 'test-model', choices: [{ index: 0, finish_reason: calls.length ? 'tool_calls' : 'stop', message: { role: 'assistant', content: text, ...(calls.length ? { tool_calls: calls } : {}) } }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
  }));
  const upstreamUrl = await listen(upstream), lesson = createToolResultsRouter({ API_BASE_URL: upstreamUrl, API_KEY: 'test-secret', MODEL: 'test-model' }, project, data);
  const server = createServer(express().use(express.json({ limit: '128kb' })).use('/api/tool-results', lesson.router)), origin = await listen(server);
  try {
    const materialResponse = await (await fetch(origin + '/api/tool-results/materials')).json();
    assert.equal((await fetch(origin + '/api/tool-results/classroom')).status, 404);
    const started = await fetch(origin + '/api/tool-results/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task: DEFAULT_TASK, predecessor }) });
    assert.equal(started.status, 202); let run = await started.json() as FeedbackRun;
    const deadline = Date.now() + 10000;
    while (run.state === 'running') { assert.ok(Date.now() < deadline, '本地反馈循环未完成'); await new Promise(resolve => setTimeout(resolve, 20)); run = await (await fetch(`${origin}/api/tool-results/runs/${run.id}`)).json(); }
    assert.equal(run.state, 'completed', run.error); assert.equal(run.calls.find(item => item.id === 'old-save')?.state, 'failed');
    assert.equal(run.readBack?.revision, 1); assert.equal(run.readBack?.body, '韩立揉过的左手仍在发疼，他试探着抓住岩壁上的石棱。');
    assert.deepEqual(materialResponse.definitions, JSON.parse(run.requests[0].body).tools.map((item: any) => item.function));
    assert.deepEqual(JSON.parse(await readFile(join(data, run.id, 'run.json'), 'utf8')), run);
    const store = new Store(join(data, run.id, 'work.sqlite'));
    try { assert.equal(store.getChapter(material.work.id, 1)?.body, predecessor.body); assert.equal(store.getChapter(material.work.id, 1)?.revision, 2); assert.equal(store.getChapter(material.work.id, 2)?.body, run.readBack?.body); }
    finally { store.close(); }
    for (const entry of run.calls.filter(item => item.state === 'completed')) {
      const echoed = run.requests.flatMap(item => JSON.parse(item.body).messages).find(item => item.role === 'tool' && item.tool_call_id === entry.id);
      assert.ok(echoed); assert.deepEqual(JSON.parse(echoed.content), entry.output);
    }
    assert.ok(!JSON.stringify(run).includes('test-secret'));
    await writeFile(join(project, 'classroom.json'), JSON.stringify(run)); const beforeReplay = requests.length;
    assert.deepEqual(await (await fetch(origin + '/api/tool-results/classroom')).json(), run); assert.equal(requests.length, beforeReplay);
  } finally { await lesson.close(); await close(server); await close(upstream); assert.ok(resolve(directory).startsWith(resolve(tmpdir()))); await rm(directory, { recursive: true, force: true }); }
});
