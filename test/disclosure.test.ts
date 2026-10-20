import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCourseApp } from '../src/server.ts';
import type { DisclosureRun } from '../labs/requests/src/disclosure/contract.ts';

async function listen(server: Server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string'); return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server) {
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
}

test('逐层输入遵从模型的真实返回顺序，完整请求与读取结果可从磁盘回查，截断不冒充完成', async () => {
  // 协议测试桩刻意先读场景再读人物，不作为课堂模型实录。
  const bodies: string[] = []; let mode = 'tiered', step = 0;
  const upstream = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk; bodies.push(body);
    assert.equal(req.headers.authorization, 'Bearer test-secret');
    const path = ['场景、物品与规则/神手谷/工作卡.md', '人物/韩立/工作卡.md'][step++];
    const message = mode === 'tiered' && path ? { role: 'assistant', content: null, tool_calls: [{ id: `call-${step}`, type: 'function', function: { name: 'read_material', arguments: JSON.stringify({ path }) } }] } : { role: 'assistant', content: mode === 'summary' ? '测试桩生成的摘要' : '测试桩回答' };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ model: 'protocol-test', choices: [{ message, finish_reason: mode === 'incomplete' ? 'length' : 'tool_calls' in message ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
  });
  const upstreamUrl = await listen(upstream), directory = await mkdtemp(join(tmpdir(), 'disclosure-'));
  const config = join(directory, 'model.json');
  const course = await createCourseApp(config, join(directory, 'data'));
  const server = createServer(course.app), origin = await listen(server);
  async function run(condition: string) {
    const response = await fetch(origin + '/api/disclosure/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ condition }) });
    return { status: response.status, run: await response.json() as DisclosureRun };
  }
  try {
    await fetch(origin + '/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseUrl: upstreamUrl, model: 'protocol-test', apiKey: 'test-secret' }) });
    const result = await run('tiered'); assert.equal(result.status, 200); assert.equal(result.run.state, 'completed');
    assert.deepEqual(result.run.reads.map(row => row.path), ['场景、物品与规则/神手谷/工作卡.md', '人物/韩立/工作卡.md']);
    assert.deepEqual(result.run.requests.map(row => row.requestBody), bodies);
    const first = JSON.parse(bodies[0]); assert.equal(first.tool_choice, 'auto');
    assert(bodies[0].includes('当前工作.md')); assert(!bodies[0].includes('一刻钟'));
    for (const [index, row] of result.run.reads.entries()) {
      const original = await readFile(join('lessons/chapter03/project/创作资料', row.path), 'utf8'); assert.equal(row.text, original);
      const next = JSON.parse(bodies[index + 1]); assert.equal(next.messages.find((message: { role: string; tool_call_id?: string }) => message.role === 'tool' && message.tool_call_id === row.callId).content, result.run.tools[index].result);
    }
    const stored = JSON.parse(await readFile(join(directory, 'data/disclosure/novel', `${result.run.id}.json`), 'utf8'));
    assert.deepEqual(stored, result.run); assert.deepEqual(await (await fetch(origin + `/api/disclosure/runs/${stored.id}`)).json(), stored);
    assert(!JSON.stringify(stored).includes('test-secret'));
    assert.equal((await fetch(origin + '/api/disclosure/materials?path=../package.json')).status, 400);
    mode = 'incomplete'; const failed = await run('tiered'); assert.equal(failed.status, 502); assert.equal(failed.run.state, 'failed'); assert.equal(failed.run.reads.length, 0); assert.equal(failed.run.requests[0].finishReason, 'length');
    mode = 'summary'; const summary = await run('summary'); assert.equal(summary.status, 200);
    assert.equal(summary.run.requests.length, 2); const compress = JSON.parse(summary.run.requests[0].requestBody), answer = JSON.parse(summary.run.requests[1].requestBody);
    assert.equal(summary.run.supplied.length, 30); assert(summary.run.supplied.every(row => /^原文\/C\d{2}\.md$/.test(row.path)));
    assert(summary.run.supplied.every(row => compress.messages[1].content.includes(`## ${row.path}\n${row.text}`)));
    assert(!compress.messages[1].content.includes('## 人物/')); assert(!compress.messages[1].content.includes('## 场景、物品与规则/'));
    assert(!JSON.stringify(compress.messages).includes('请围绕当前工作页续写韩立安排下一轮催药的一场戏'));
    assert(JSON.stringify(answer.messages).includes(summary.run.summary!)); assert(!JSON.stringify(answer.messages).includes('一个月还有三十个铜板拿')); assert.equal(answer.messages.length, 2); assert.equal(answer.tools, undefined);
  } finally { await close(server); await close(upstream); course.close(); await rm(directory, { recursive: true, force: true }); }
});
