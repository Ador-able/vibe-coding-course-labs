import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createTasksRouter } from '../labs/requests/src/tasks/routes.ts';
import { assessRun, checkOutput, totals } from '../labs/requests/src/tasks/checks.ts';
import { FEEDBACK_CRITERION, FEEDBACK_TARGET, type RunInput, type TaskRun } from '../labs/requests/src/tasks/contract.ts';
import { criteria } from '../labs/requests/src/tasks/materials.ts';

async function listen(server: Server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string'); return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server) { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }

test('样例只改变指定输入，成本核对复用同一初稿，失败与真实用量落盘', async () => {
  const received: { messages: { role: string; content: string }[]; max_tokens?: number }[] = [];
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
    const conflict = await post({ lesson: 'examples', caseId: 'S1', method: 'conflict', batchId });
    const firstInput = received[0].messages.filter(item => item.role === 'user').map(item => item.content).join('\n');
    const secondInput = received[1].messages.filter(item => item.role === 'user').map(item => item.content).join('\n');
    assert.ok(secondInput.startsWith(firstInput)); assert.ok(!firstInput.includes('<写法样例>')); assert.match(secondInput, /<写法样例>/);
    assert.ok(!Object.hasOwn(received[0], 'max_tokens')); assert.ok(!Object.hasOwn(received[1], 'max_tokens'));
    assert.equal(plain.run.request.responseModel, 'reported-model'); assert.equal(conflict.run.state, 'completed');
    assert.doesNotMatch(firstInput, /不使用工具|不调用其他\s*Agent/);
    assert.equal(plain.run.checks.hanCount, 810); assert.deepEqual(plain.run.judgments, {});
    assert.equal(assessRun(plain.run, [{ id: 'fact-1', text: '角色与身份' }]).label, '待核');
    const overlong = { ...plain.run, checks: checkOutput('# 标题\n' + '字'.repeat(1387)) };
    assert.match(assessRun(overlong, []).reason, /1387.*超过 1200/);
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
    const judgedRun = JSON.parse(await readFile(join(directory, `${a.id}.json`), 'utf8'));
    assert.equal(judgedRun.judgments['fact-1'].decision, 'fail');
    assert.match(assessRun(judgedRun, [{ id: 'fact-1', text: '角色与身份' }]).reason, /全文仅有“攀爬”重复/);
    finish = 'stop';
    await post({ lesson: 'evaluation', caseId: 'S3', method: 'A', batchId: randomUUID() });
    const baseline = received.at(-1)!.messages.find(item => item.role === 'user')!.content;
    await post({ lesson: 'evaluation', caseId: 'S3', method: 'B', batchId: randomUUID() });
    const revised = received.at(-1)!.messages.find(item => item.role === 'user')!.content;
    assert.ok(revised.startsWith(baseline)); assert.match(revised.slice(baseline.length), /写作前，先核对/);
    assert.match(baseline, /随墨大夫入谷/);
    const feedback = (await post({ lesson: 'feedback', caseId: 'S1', method: 'none', batchId: randomUUID() })).run;
    const feedbackInput = received.at(-1)!;
    assert.ok(!Object.hasOwn(feedbackInput, 'max_tokens'));
    const feedbackPrompt = feedbackInput.messages.find(item => item.role === 'user')!.content;
    assert.match(feedbackPrompt, /我希望说得更直接/);
    assert.doesNotMatch(feedbackPrompt, /替换为|想当正式弟子，就得在正午前到崖顶/);
    const expression = { [FEEDBACK_CRITERION.id]: { decision: 'pass', evidence: '已对照规则段，表达效果由阅读判断。' } };
    const expressionSaved = await fetch(origin + `/api/tasks/runs/${feedback.id}/judgments`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(expression) });
    assert.equal(expressionSaved.status, 200);
    assert.deepEqual((await expressionSaved.json()).judgments, expression);
  } finally {
    await close(server); await close(modelServer);
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()))); await rm(directory, { recursive: true, force: true });
  }
});

test('局部反馈不预设改写答案，范围内不同表达都可核对，越界与未改动分别显示', () => {
  const original = '# 选拔开端\n\n岳堂主说：“' + FEEDBACK_TARGET + '”\n\n他继续攀爬。';
  for (const wording of ['你们必须在正午前登上崖顶，才能成为正式弟子。', '正午前上崖顶！想成为正式弟子，就记住这个时限。']) {
    const checks = checkOutput(original.replace(FEEDBACK_TARGET, wording), original);
    assert.equal(checks.outsideTargetUnchanged, true); assert.equal(checks.targetChanged, true);
  }
  const changed = original.replace(FEEDBACK_TARGET, '正午前登上崖顶，才有资格成为正式弟子。').replace('继续', '停止');
  assert.equal(checkOutput(changed, original).outsideTargetUnchanged, false);
  assert.equal(checkOutput(original, original).outsideTargetUnchanged, true);
  assert.equal(checkOutput(original, original).targetChanged, false);
  const missing = checkOutput(original.replace(FEEDBACK_TARGET, ''), '# 其他原稿\n\n没有这段对白。');
  assert.equal(missing.outsideTargetUnchanged, false);
});

test('课堂实录保留实际输入、正文与人工核对，成本两条路径复用原初稿，读取不产生本机运行', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tasks-classroom-'));
  const project = resolve('lessons/chapter04/project');
  // 不提供任何模型配置，历史阅读仍然可用。
  const server = createServer(express().use(express.json()).use('/api/tasks', createTasksRouter({}, project, directory)));
  const origin = await listen(server);
  try {
    const records = await Promise.all(['goals', 'examples', 'feedback', 'evaluation', 'cost'].map(async lesson => {
      const response = await fetch(`${origin}/api/tasks/classroom/${lesson}`);
      assert.equal(response.status, 200); return await response.json() as TaskRun[];
    }));
    assert.deepEqual(records.map(runs => runs.length), [1, 6, 1, 5, 4]);
    for (const runs of records) assert.equal(new Set(runs.map(run => run.batchId)).size, 1);
    for (const run of records.filter((_, index) => index !== 1).flat()) {
      assert.ok(run.output); assert.ok(run.request.requestBody);
      if (run.state === 'completed') {
        const required = [...criteria(run.caseId), ...(run.lesson === 'feedback' ? [FEEDBACK_CRITERION] : [])];
        assert.equal(assessRun(run, required).label, '符合本轮章稿条件');
        for (const item of required) {
          assert.equal(run.judgments[item.id].decision, 'pass');
          assert.match(run.judgments[item.id].evidence, /资料：[\s\S]+判断：/);
        }
        for (const item of Object.values(run.judgments)) {
          for (const quote of item.evidence.matchAll(/^“(.+)”$/gm)) assert.ok(run.output.includes(quote[1]), `课堂引用不在实际正文中：${quote[1]}`);
        }
      } else assert.deepEqual(run.judgments, {});
    }
    const examples = JSON.parse(await readFile(join(project, '课堂记录/样例对照.json'), 'utf8')) as TaskRun[];
    assert.equal(examples.length, 6);
    for (const [index, run] of records[1].entries()) {
      assert.equal(run.state, 'completed'); assert.equal(run.request.finishReason, 'stop');
      assert.equal(run.output, examples[index].output);
      assert.deepEqual(run.request, examples[index].request);
      assert.deepEqual(run.judgments, examples[index].judgments);
      assert.ok(!Object.hasOwn(JSON.parse(run.request.requestBody), 'max_tokens'));
    }
    assert.equal(records[2][0].checks.outsideTargetUnchanged, true);
    assert.equal(records[2][0].checks.targetChanged, true);
    const pair = records[4].filter(run => run.caseId === 'S2'), a = pair.find(run => run.method === 'A')!, b = pair.find(run => run.method === 'B')!;
    assert.equal(b.parentId, a.id); assert.equal(totals([a, a, b]).calls, 2);
    assert.equal(totals(pair).input, 48289); assert.equal(totals(pair).output, 2389);
    assert.equal(b.judgments.scope.decision, 'fail');
    assert.match(b.judgments.scope.evidence, /超出了仅修改不符之处的范围/);
    assert.deepEqual(await readdir(directory), []);
    const edit = await fetch(`${origin}/api/tasks/runs/${a.id}/judgments`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(edit.status, 400);
    assert.equal((await fetch(`${origin}/api/tasks/classroom/unknown`)).status, 400);
  } finally {
    await close(server);
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()))); await rm(directory, { recursive: true, force: true });
  }
});
