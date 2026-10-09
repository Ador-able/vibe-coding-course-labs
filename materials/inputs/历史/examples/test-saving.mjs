import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {chromium, expect} from '@playwright/test';
import {Store} from '../dist/store.js';
import {prototypeServer} from '../dist/prototype-http.js';
import {seedPrototype} from './prototype-seed.mjs';

// 运行：node --test scripts/test-saving.mjs。先留完整行为证据，再核业务约定。
const limit = 30_000;
const root = resolve('runs', 'saving-' + randomUUID());
await mkdir(root, {recursive: true});
console.log('完整证据目录：' + root);
const json = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
const additions = {
  before: {title: ' · 保存前补记', body: '\n\n保存前补记：林澈把观察时间写在页边。'},
  post: {title: '【POST等待输入】', body: '\nPOST等待输入：周伯仍站在窗边。'},
  get: {title: '【读回等待输入】', body: '\n读回等待输入：林澈又核对了一次记号。'},
  after: {title: '【恢复编辑】', body: '\n恢复编辑：这段暂留本地。'},
  failed: {title: '【失败后编辑】', body: '\n失败后编辑：这段本地补记不能丢。'},
};
const append = (value, suffix) => ({title: value.title + suffix.title, body: value.body + suffix.body});

function signal() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return {promise, release};
}

async function bounded(promise, name) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(name + ' 超过 30 秒')), limit); }),
    ]);
  } finally { clearTimeout(timer); }
}

// 门只决定真实请求何时继续或失败，不提供伪造响应。
async function gate(page, pattern, method, evidence, name, failure = false) {
  const entered = signal(), released = signal(), finished = signal();
  const record = {name, method, entered: false, released: false, finished: false, failure, errors: []};
  evidence.gates.push(record);
  await page.route(pattern, async route => {
    if (route.request().method() !== method || record.entered) { await route.continue(); return; }
    record.entered = true;
    record.enteredAt = new Date().toISOString();
    record.request = {url: route.request().url(), method, headers: route.request().headers(),
      text: route.request().postData(), submitted: route.request().postDataJSON()};
    entered.release();
    try {
      await bounded(released.promise, name + ' 路由门');
      record.action = failure ? "abort('failed')" : 'continue';
      if (failure) await route.abort('failed');
      else await route.continue();
    } catch (error) {
      record.errors.push(error.stack);
      await route.abort('failed').catch(abortError => record.errors.push(abortError.stack));
    } finally {
      record.finished = true;
      record.finishedAt = new Date().toISOString();
      finished.release();
    }
  });
  return {
    record,
    wait: () => bounded(entered.promise, name + ' 请求进门'),
    release: () => { record.released = true; released.release(); },
    settle: () => record.entered ? bounded(finished.promise, name + ' 释放') : Promise.resolve(),
  };
}

function database(store, id) {
  return {
    work: store.getWork(id),
    chapters: store.listChapters(id).map(c => store.getChapter(id, c.number)),
    versions: store.db.prepare('SELECT number, revision, content FROM chapter_versions WHERE work_id=? ORDER BY number, revision')
      .all(id).map(row => ({number: row.number, revision: row.revision, chapter: JSON.parse(row.content)})),
    summary: store.exportWork(id),
  };
}

function controls(page) {
  return {
    title: page.getByLabel('章名', {exact: true}),
    body: page.getByLabel('正文', {exact: true}),
    save: page.getByRole('button', {name: '保存草稿', exact: true}),
    reload: page.getByRole('button', {name: '重新读取', exact: true}),
    read: page.getByRole('button', {name: '读取当前稿', exact: true, includeHidden: true}),
    overwrite: page.getByRole('button', {name: '以当前稿重新编辑', exact: true, includeHidden: true}),
  };
}

async function state(page) {
  const c = controls(page), buttons = {};
  for (const name of ['save', 'reload', 'read', 'overwrite']) {
    buttons[name] = {visible: await c[name].isVisible(), enabled: await c[name].isEnabled()};
  }
  return {
    title: await c.title.inputValue(), body: await c.body.inputValue(),
    titleEditable: await c.title.isEditable(), bodyEditable: await c.body.isEditable(),
    status: await page.getByRole('status').innerText(),
    editState: await page.getByText(/^(有未保存修改|与已读取稿一致)$/).innerText(),
    revision: await page.getByText(/^读取 r\d+ ·/).innerText(),
    chapter: await page.getByText(/^第 \d+ 章 · 当前草稿$/).innerText(),
    buttons,
    comparison: await c.overwrite.isVisible() ? {
      heading: await page.getByRole('heading', {name: /^当前已保存稿/}).innerText(),
      body: await page.getByLabel('当前已保存正文', {exact: true}).inputValue(),
    } : null,
  };
}

async function keyboardAppend(page, suffix) {
  const c = controls(page), attempts = [];
  for (const name of ['title', 'body']) {
    await c[name].focus();
    const focused = await c[name].evaluate(element => element === document.activeElement);
    await page.keyboard.press('Control+End');
    await page.keyboard.type(suffix[name]);
    attempts.push({field: name, text: suffix[name], focused});
  }
  return attempts;
}

async function checkpoint(page, evidence, name) {
  const value = await state(page);
  evidence.states[name] = value;
  await json(join(evidence.dir, 'evidence.json'), evidence);
  return value;
}

async function observe(variant, failure = false) {
  const dir = await mkdtemp(join(root, (failure ? 'failure-' : 'normal-') + variant + '-'));
  const evidence = {dir, variant, scenario: failure ? '请求进服务前传输失败' : '保存及读回等待期间暂停编辑',
    node: process.version, browser: '本机 Edge / 隔离上下文', additions,
    gates: [], states: {}, keyboard: {}, http: [], serverRequests: [], pageErrors: [], recorderErrors: [], dialogs: []};
  let store, server, browser, context, page;
  const gates = [], pending = [];
  try {
    const db = join(dir, 'fixture.sqlite');
    evidence.db = db;
    evidence.initial = await seedPrototype(db);
    store = new Store(db);
    const id = evidence.initial.work.id;
    evidence.databaseBefore = database(store, id);
    server = prototypeServer(store, id);
    // 独立记录服务入口，证明 abort 的请求从未抵达 HTTP 服务。
    server.prependListener('request', (request, response) => {
      const event = {method: request.method, url: request.url, at: new Date().toISOString()};
      evidence.serverRequests.push(event);
      response.once('finish', () => { event.status = response.statusCode; event.finishedAt = new Date().toISOString(); });
    });
    server.listen(0, '127.0.0.1');
    await bounded(once(server, 'listening'), '服务监听');
    const base = 'http://127.0.0.1:' + server.address().port;
    evidence.url = base + '/?variant=' + variant + '&work=' + encodeURIComponent(id);
    browser = await chromium.launch({channel: 'msedge', headless: true, timeout: limit});
    context = await browser.newContext({viewport: {width: 1440, height: 1200}, locale: 'zh-CN'});
    page = await context.newPage();
    page.setDefaultTimeout(limit);
    page.on('pageerror', error => evidence.pageErrors.push(error.stack));
    page.on('dialog', dialog => {
      evidence.dialogs.push({type: dialog.type(), message: dialog.message()});
      pending.push(dialog.accept().catch(error => evidence.recorderErrors.push(error.stack)));
    });
    page.on('request', request => {
      if (!new URL(request.url()).pathname.startsWith('/api/')) return;
      evidence.http.push({event: 'request', url: request.url(), method: request.method(),
        text: request.postData(), submitted: request.postDataJSON(), at: new Date().toISOString()});
    });
    page.on('response', response => {
      if (!new URL(response.url()).pathname.startsWith('/api/')) return;
      const event = {event: 'response', url: response.url(), method: response.request().method(),
        status: response.status(), headers: response.headers(), at: new Date().toISOString()};
      evidence.http.push(event);
      pending.push((async () => {
        event.text = await response.text();
        event.response = JSON.parse(event.text);
      })().catch(error => evidence.recorderErrors.push(error.stack)));
    });
    page.on('requestfailed', request => evidence.http.push({event: 'failed', url: request.url(),
      method: request.method(), text: request.postData(), failure: request.failure(), at: new Date().toISOString()}));
    page.on('requestfinished', request => {
      if (new URL(request.url()).pathname.startsWith('/api/')) evidence.http.push({event: 'finished',
        url: request.url(), method: request.method(), at: new Date().toISOString()});
    });
    await page.goto(evidence.url);
    await expect(page.getByRole('status')).toContainText('已读取', {timeout: limit});
    const c = controls(page);
    const chapterName = evidence.initial.chapters.find(ch => ch.number === 2).title;
    await page.getByRole('navigation', {name: '章节', exact: true})
      .getByRole('button', {name: new RegExp(chapterName)}).click();
    await checkpoint(page, evidence, 'initial');
    evidence.expectedSaved = append(evidence.initial.chapters[1], additions.before);
    evidence.keyboard.before = await keyboardAppend(page, additions.before);
    if (!failure) {
      // 先让覆盖入口可见；后续等待时必须一起暂停该动作。
      const comparisonResponse = page.waitForResponse(r => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/work');
      await c.reload.click();
      await comparisonResponse;
      await expect(page.getByRole('status')).toContainText('本地修改仍在上方', {timeout: limit});
    }
    await checkpoint(page, evidence, 'beforeSave');
    evidence.serverBeforeSave = evidence.serverRequests.length;
    // 初次读取、选章和对照完成之后，才启用本轮保存的门。
    const post = await gate(page, '**/api/draft', 'POST', evidence, 'POST', failure);
    gates.push(post);
    let readback;
    if (!failure) {
      readback = await gate(page, /\/api\/work(?:\?|$)/, 'GET', evidence, 'GET读回');
      gates.push(readback);
    }
    await c.save.click();
    await post.wait();
    await checkpoint(page, evidence, 'postEntered');
    evidence.serverAtPostGate = evidence.serverRequests.slice(evidence.serverBeforeSave);
    evidence.databaseAtPostGate = database(store, id);

    if (failure) {
      const failedRequest = page.waitForEvent('requestfailed', {predicate: request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/draft'});
      post.release();
      await failedRequest;
      await post.settle();
      await expect(page.getByRole('status')).toContainText('未确认', {timeout: limit});
      await checkpoint(page, evidence, 'afterFailure');
      evidence.keyboard.failed = await keyboardAppend(page, additions.failed);
      await checkpoint(page, evidence, 'editableAfterFailure');
      evidence.databaseAfterFailure = database(store, id);
      // 对禁用的保存按钮作真实鼠标操作，并记录它没有发送第二个 POST。
      const box = await c.save.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await checkpoint(page, evidence, 'blockedRetry');
      const confirmed = page.waitForResponse(r => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/work');
      await c.read.click();
      const response = await confirmed;
      await response.finished();
      await expect(page.getByRole('status')).toContainText('本地修改仍在上方', {timeout: limit});
      await checkpoint(page, evidence, 'confirmedByRead');
    } else {
      evidence.keyboard.post = await keyboardAppend(page, additions.post);
      await checkpoint(page, evidence, 'postWaiting');
      const postResponse = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/draft');
      post.release();
      const response = await postResponse;
      await response.finished();
      evidence.postResponse = {status: response.status(), headers: response.headers(), text: await response.text(), value: await response.json()};
      await readback.wait();
      await checkpoint(page, evidence, 'getEnteredAfterPostReturned');
      evidence.databaseWhileGetWaits = database(store, id);
      evidence.keyboard.get = await keyboardAppend(page, additions.get);
      await checkpoint(page, evidence, 'getWaiting');
      const readResponse = page.waitForResponse(r => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/work');
      readback.release();
      const incoming = await readResponse;
      await incoming.finished();
      evidence.readbackResponse = {status: incoming.status(), headers: incoming.headers(), text: await incoming.text(), value: await incoming.json()};
      await expect(page.getByRole('status')).toContainText('已保存草稿', {timeout: limit});
      await checkpoint(page, evidence, 'completed');
      evidence.databaseAfterSave = database(store, id);
      evidence.keyboard.after = await keyboardAppend(page, additions.after);
      await checkpoint(page, evidence, 'editableAfterSave');
    }
    const refreshResponse = page.waitForResponse(r => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/work');
    await page.reload();
    const refreshed = await refreshResponse;
    await refreshed.finished();
    evidence.refreshResponse = {status: refreshed.status(), text: await refreshed.text(), value: await refreshed.json()};
    await expect(page.getByRole('status')).toContainText('已读取', {timeout: limit});
    await checkpoint(page, evidence, 'refreshed');
    evidence.databaseFinal = database(store, id);
    evidence.observationComplete = true;
  } catch (error) {
    evidence.observationError = {message: error.message, stack: error.stack};
  } finally {
    // 任意等待或操作失败都释放所有门；清理错误也进入证据和失败断言。
    for (const g of gates) g.release();
    const cleanup = async (name, action) => {
      try { await bounded(action(), name); }
      catch (error) { (evidence.cleanupErrors ??= []).push({name, stack: error.stack}); }
    };
    for (const g of gates) await cleanup('释放路由门', () => g.settle());
    if (page) await cleanup('撤销路由', () => page.unrouteAll({behavior: 'wait'}));
    await cleanup('响应记录', () => Promise.all(pending));
    if (context) await cleanup('关闭浏览器上下文', () => context.close());
    if (browser) await cleanup('关闭浏览器', () => browser.close());
    if (server?.listening) await cleanup('关闭 HTTP 服务', () => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    }));
    if (store) await cleanup('关闭数据库', async () => { store.close(); });
    evidence.cleanupComplete = !(evidence.cleanupErrors?.length);
    await json(join(dir, 'evidence.json'), evidence);
  }
  return evidence;
}

function values(value) { return {title: value.title, body: value.body}; }

// 每项核对独立记录，最后统一抛出；第一个红灯不遮住读回和刷新。
async function verify(evidence) {
  const checks = [], errors = [];
  const check = (name, action) => {
    try { action(); checks.push({name, passed: true}); }
    catch (error) { checks.push({name, passed: false, message: error.message}); errors.push(new Error(evidence.variant + '：' + name, {cause: error})); }
  };
  check('行为记录完成且无环境、记录或清理错误', () => {
    assert.equal(evidence.observationComplete, true, evidence.observationError?.stack);
    assert.deepEqual(evidence.pageErrors, []);
    assert.deepEqual(evidence.recorderErrors, []);
    assert.deepEqual(evidence.cleanupErrors ?? [], []);
    assert.ok(evidence.gates.every(g => !g.errors.length && g.finished));
  });
  if (evidence.observationComplete) {
    const s = evidence.states, expected = evidence.expectedSaved, initial = evidence.initial.chapters;
    check('完整三章原样初始化，保存前输入准确', () => {
      assert.equal(initial.length, 3);
      assert.deepEqual(values(s.initial), values(initial[1]));
      assert.deepEqual(values(s.beforeSave), expected);
      assert.equal(s.initial.chapter, '第 2 章 · 当前草稿');
    });
    check('门截到实际提交对象，POST 尚未进入服务', () => {
      assert.deepEqual(values(evidence.gates[0].request.submitted), expected);
      assert.equal(evidence.gates[0].request.submitted.chapterNumber, 2);
      assert.equal(evidence.gates[0].request.submitted.expectedChapterRevision, initial[1].revision);
      assert.deepEqual(evidence.serverAtPostGate.filter(r => r.method === 'POST'), []);
      assert.deepEqual(evidence.databaseAtPostGate, evidence.databaseBefore);
    });
    if (evidence.scenario === '请求进服务前传输失败') {
      const local = append(expected, additions.failed);
      check('失败后本地修改保留，章名和正文恢复编辑', () => {
        assert.deepEqual(values(s.afterFailure), expected);
        assert.ok(s.afterFailure.titleEditable && s.afterFailure.bodyEditable);
        assert.deepEqual(values(s.editableAfterFailure), local);
        assert.ok(evidence.keyboard.failed.every(a => a.focused));
        assert.match(s.afterFailure.status, /未确认/);
        assert.ok(s.afterFailure.buttons.read.visible && s.afterFailure.buttons.read.enabled);
      });
      check('未确认时不能直接再保存；没有服务写入或新修订', () => {
        assert.equal(s.blockedRetry.buttons.save.enabled, false);
        assert.deepEqual(values(s.blockedRetry), local);
        assert.equal(evidence.http.filter(e => e.event === 'request' && e.method === 'POST').length, 1);
        assert.equal(evidence.http.filter(e => e.event === 'response' && e.method === 'POST').length, 0);
        assert.equal(evidence.http.filter(e => e.event === 'failed' && e.method === 'POST').length, 1);
        assert.equal(evidence.serverRequests.filter(r => r.method === 'POST').length, 0);
        assert.equal(evidence.gates[0].record, undefined);
        assert.equal(evidence.gates[0].action, "abort('failed')");
        assert.deepEqual(evidence.databaseAfterFailure, evidence.databaseBefore);
      });
      check('先真实读取当前稿，保留本地修改并允许继续编辑', () => {
        assert.deepEqual(values(s.confirmedByRead), local);
        assert.equal(s.confirmedByRead.comparison.body, initial[1].body);
        assert.ok(s.confirmedByRead.titleEditable && s.confirmedByRead.bodyEditable);
        assert.ok(s.confirmedByRead.buttons.save.enabled);
      });
      check('刷新和数据库均仍是失败前完整三章', () => {
        assert.deepEqual(values(s.refreshed), values(initial[1]));
        assert.deepEqual(evidence.refreshResponse.value.chapters.map(values), initial.map(values));
        assert.deepEqual(evidence.databaseFinal, evidence.databaseBefore);
      });
    } else {
      for (const phase of ['postWaiting', 'getWaiting']) {
        check(phase + ' 不接纳等待期间输入', () => assert.deepEqual(values(s[phase]), expected));
        check(phase + ' 暂停章名、正文和覆盖编辑动作', () => {
          assert.equal(s[phase].titleEditable, false);
          assert.equal(s[phase].bodyEditable, false);
          assert.equal(s[phase].buttons.save.enabled, false);
          assert.equal(s[phase].buttons.reload.enabled, false);
          assert.equal(s[phase].buttons.read.enabled, false);
          assert.equal(s[phase].buttons.overwrite.visible, true);
          assert.equal(s[phase].buttons.overwrite.enabled, false);
        });
      }
      check('POST 真实返回后 GET 仍等待，服务已保存完整新修订', () => {
        assert.equal(evidence.postResponse.status, 200);
        assert.deepEqual(values(evidence.postResponse.value), expected);
        assert.equal(evidence.postResponse.value.revision, initial[1].revision + 1);
        assert.deepEqual(evidence.databaseWhileGetWaits.chapters[1], evidence.postResponse.value);
        assert.ok(evidence.gates[1].entered);
        assert.match(s.getEnteredAfterPostReturned.status, /正在保存/);
      });
      check('真实保存、读回、刷新和数据库一致，且仅新增一个修订', () => {
        assert.equal(evidence.readbackResponse.status, 200);
        assert.deepEqual(values(evidence.readbackResponse.value.chapters[1]), expected);
        assert.deepEqual(values(s.completed), expected);
        assert.match(s.completed.status, /已保存.*读回/);
        assert.deepEqual(values(s.refreshed), expected);
        assert.deepEqual(values(evidence.refreshResponse.value.chapters[1]), expected);
        assert.deepEqual(values(evidence.databaseFinal.chapters[1]), expected);
        assert.equal(evidence.databaseFinal.chapters[1].revision, initial[1].revision + 1);
        assert.equal(evidence.databaseFinal.versions.length, evidence.databaseBefore.versions.length + 1);
        assert.equal(evidence.serverRequests.filter(r => r.method === 'POST' && r.url === '/api/draft').length, 1);
        for (const i of [0, 2]) assert.deepEqual(evidence.databaseFinal.chapters[i], initial[i]);
      });
      check('结束后恢复章名、正文和覆盖入口，能用键盘继续编辑', () => {
        assert.ok(s.completed.titleEditable && s.completed.bodyEditable);
        assert.ok(s.completed.buttons.reload.enabled && s.completed.buttons.read.enabled && s.completed.buttons.overwrite.enabled);
        assert.deepEqual(values(s.editableAfterSave), append(expected, additions.after));
        assert.ok(evidence.keyboard.after.every(a => a.focused));
        assert.ok(s.editableAfterSave.buttons.save.enabled);
      });
    }
  }
  await json(join(evidence.dir, 'assertions.json'), checks);
  return errors;
}

test('正常保存：原版、台面、笔记页在 POST 和读回等待期间暂停编辑', {timeout: 300_000}, async () => {
  const observations = [];
  for (const variant of ['original', 'desk', 'notes']) observations.push(await observe(variant));
  const errors = [];
  for (const evidence of observations) errors.push(...await verify(evidence));
  await json(join(root, 'normal-result.json'), {cases: observations.map(e => e.dir), failures: errors.map(e => e.message)});
  if (errors.length) throw new AggregateError(errors, '正常保存违反等待期约定；完整证据见 ' + root);
});

test('原版受控传输失败：请求未进服务，保留本地修改并先读取当前稿', {timeout: 150_000}, async () => {
  const evidence = await observe('original', true);
  const errors = await verify(evidence);
  await json(join(root, 'failure-result.json'), {case: evidence.dir, failures: errors.map(e => e.message)});
  if (errors.length) throw new AggregateError(errors, '传输失败场景未满足约定；完整证据见 ' + root);
});
