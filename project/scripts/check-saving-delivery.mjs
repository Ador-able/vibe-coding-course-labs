import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {once} from 'node:events';
import {createHash, randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

// 只观察原版正常保存；补记和业务预期来自教师独立预期，不从实际返回推导。
const limit = 30_000;
const project = fileURLToPath(new URL('../', import.meta.url));
const additions = {
  before: {title: ' · 保存前补记', body: '\n\n保存前补记：林澈把观察时间写在页边。'},
  post: {title: '【POST等待输入】', body: '\nPOST等待输入：周伯仍站在窗边。'},
  get: {title: '【读回等待输入】', body: '\n读回等待输入：林澈又核对了一次记号。'},
  after: {title: '【恢复编辑】', body: '\n恢复编辑：这段暂留本地。'},
};
const values = value => ({title: value.title, body: value.body});
const append = (value, suffix) => ({title: value.title + suffix.title, body: value.body + suffix.body});
const errorValue = error => ({name: error.name, message: error.message, stack: error.stack});
const json = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');

function signal() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return {promise, release};
}

async function bounded(promise, name) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(name + ' 超过 30 秒')), limit);
    })]);
  } finally { clearTimeout(timer); }
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
    titleFocused: await c.title.evaluate(element => element === document.activeElement),
    bodyFocused: await c.body.evaluate(element => element === document.activeElement),
    status: await page.getByRole('status').innerText(),
    revision: await page.locator('#revision').innerText(),
    chapter: await page.locator('#chapter-label').innerText(),
    editState: await page.locator('#edit-state').innerText(),
    buttons,
    comparison: await c.overwrite.isVisible() ? {
      heading: await page.locator('#remote-heading').innerText(),
      body: await page.getByLabel('当前已保存正文', {exact: true}).inputValue(),
    } : null,
  };
}

// 焦点、键盘动作及每个字段尝试后的全值都留存；不绕过 disabled。
async function keyboardAppend(page, suffix, evidence, phase) {
  const c = controls(page), attempts = evidence.keyboard[phase] = [];
  for (const field of ['title', 'body']) {
    const attempt = {field, text: suffix[field], before: await state(page), actions: []};
    attempts.push(attempt);
    await c[field].focus();
    attempt.actions.push('locator.focus()');
    attempt.focused = await c[field].evaluate(element => element === document.activeElement);
    await page.keyboard.press('Control+End');
    attempt.actions.push('keyboard.press(Control+End)');
    await page.keyboard.type(suffix[field]);
    attempt.actions.push('keyboard.type(上述原文)');
    attempt.after = await state(page);
  }
}

function database(store, id) {
  const tables = {};
  for (const [name, order] of [
    ['works', 'id'], ['work_versions', 'work_id, revision'], ['chapters', 'work_id, number'],
    ['chapter_versions', 'work_id, number, revision'], ['tasks', 'id'],
  ]) {
    tables[name] = store.db.prepare(`SELECT * FROM ${name} ORDER BY ${order}`).all()
      .map(row => ({...row, value: JSON.parse(row.content)}));
  }
  return {
    work: store.getWork(id),
    chapters: store.listChapters(id).map(c => store.getChapter(id, c.number)),
    summary: store.exportWork(id), tables,
  };
}

// 门只延迟一次真实请求。异常时 abort 用于收尾，不提供伪响应。
async function gate(page, pattern, method, name, evidence, gates) {
  const entered = signal(), released = signal(), finished = signal();
  const record = {name, method, entered: false, released: false, finished: false, errors: []};
  const handle = {
    record,
    wait: () => bounded(entered.promise, name + ' 请求进门'),
    release: () => {
      if (!record.released) record.releasedAt = new Date().toISOString();
      record.released = true;
      released.release();
    },
    settle: () => record.entered ? bounded(finished.promise, name + ' 路由收尾') : Promise.resolve(),
  };
  evidence.gates.push(record);
  gates.push(handle);
  await page.route(pattern, async route => {
    if (route.request().method() !== method || record.entered) {
      try { await route.continue(); } catch (error) { record.errors.push(errorValue(error)); }
      return;
    }
    try {
      record.entered = true;
      record.enteredAt = new Date().toISOString();
      const request = route.request();
      record.request = {url: request.url(), method, headers: request.headers(),
        text: request.postData(), submitted: request.postDataJSON()};
      entered.release();
      await bounded(released.promise, name + ' 路由门');
      record.action = 'continue';
      await route.continue();
    } catch (error) {
      record.errors.push(errorValue(error));
      await route.abort('failed').catch(error => record.errors.push(errorValue(error)));
    } finally {
      record.finished = true;
      record.finishedAt = new Date().toISOString();
      finished.release();
    }
  });
  return handle;
}

async function observe(evidence) {
  let store, server, browser, context, page;
  const gates = [], pending = [];
  let phase = '环境初始化';
  const record = async () => {
    try { await json(join(evidence.dir, 'evidence.json'), evidence); }
    catch (error) { evidence.recorderErrors.push({phase: '写证据', ...errorValue(error)}); }
  };
  const checkpoint = async name => { evidence.states[name] = await state(page); await record(); };
  // 先注册监听；立即接住拒绝，避免动作失败后出现无人接收的等待异常。
  const nextResponse = (method, path) => {
    const promise = page.waitForResponse(response => response.request().method() === method &&
      new URL(response.url()).pathname === path, {timeout: limit})
      .then(response => ({response}), error => {
        evidence.observationErrors.push({phase: '等待响应 ' + method + ' ' + path, ...errorValue(error)});
        return {error};
      });
    pending.push(promise);
    return promise;
  };
  const responseValue = async waiting => {
    const result = await waiting;
    if (result.error) throw result.error;
    const response = result.response;
    const failure = await bounded(response.finished(), '响应完成');
    if (failure) throw failure;
    const text = await bounded(response.text(), '响应全文');
    return {url: response.url(), status: response.status(), headers: response.headers(), text, value: JSON.parse(text)};
  };
  const ready = () => page.waitForFunction(() =>
    document.getElementById('revision').textContent.length > 0 && !document.getElementById('reload').disabled,
  null, {timeout: limit});

  try {
    const [{Store}, {prototypeServer}, {seedPrototype}, {chromium}] = await Promise.all([
      import('../dist/store.js'), import('../dist/prototype-http.js'),
      import('./prototype-seed.mjs'), import('@playwright/test'),
    ]);
    const fixtureBytes = await readFile(join(project, 'fixtures/three-chapter-archive.json'));
    const seedBytes = await readFile(join(project, 'scripts/prototype-seed.mjs'));
    evidence.source = {
      fixturePath: 'fixtures/three-chapter-archive.json',
      fixtureSHA256: createHash('sha256').update(fixtureBytes).digest('hex'),
      fixtureText: fixtureBytes.toString('utf8'), fixture: JSON.parse(fixtureBytes.toString('utf8')),
      seed: 'scripts/prototype-seed.mjs', seedSHA256: createHash('sha256').update(seedBytes).digest('hex'),
      operator: '教师初始化+正常UI保存；模型仅编写检查入口',
      note: '既有归档完整正文，经 seedPrototype / Store 人工初始化为作品 r1 和三章 r1/human/draft；不导入归档旧历史/任务/采用状态，不是本轮模型新写的小说。',
      expectedSource: 'A从固定fixture第2章完整title/body加before拼接；不能取实际页面或POST返回反推',
      teacherTestSHA256: 'c2ce7ae8608d6f4437f6bb0c641754db35099d98a8f93e106b13b0e7fc318d92',
    };
    evidence.expectedA = append(evidence.source.fixture.chapters.find(c => c.number === 2), additions.before);
    evidence.db = join(evidence.dir, 'fixture.sqlite');
    evidence.workId = 'delivery-' + randomUUID();
    evidence.initial = await seedPrototype(evidence.db, evidence.workId);
    store = new Store(evidence.db);
    const id = evidence.workId;
    evidence.databaseBefore = database(store, id);
    await record();
    server = prototypeServer(store, id);
    server.prependListener('request', (request, response) => {
      const event = {method: request.method, url: request.url, headers: request.headers, at: new Date().toISOString()};
      evidence.serverRequests.push(event);
      response.once('finish', () => {
        event.status = response.statusCode;
        event.finishedAt = new Date().toISOString();
      });
    });
    server.listen(0, '127.0.0.1');
    await bounded(once(server, 'listening'), '服务监听');
    evidence.url = 'http://127.0.0.1:' + server.address().port + '/?variant=original&work=' + encodeURIComponent(id);
    const channel = process.env.DELIVERY_BROWSER_CHANNEL;
    if (channel !== undefined && channel !== 'msedge') throw new Error('DELIVERY_BROWSER_CHANNEL 只允许显式 msedge；未设置时使用 Chromium');
    browser = await chromium.launch({headless: true, timeout: limit, ...(channel ? {channel} : {})});
    evidence.browser = {browser: browser.browserType().name(), version: browser.version(), channel: channel ?? 'chromium'};
    console.log('实际浏览器：' + JSON.stringify(evidence.browser));
    context = await browser.newContext({viewport: {width: 1440, height: 1200}, locale: 'zh-CN'});
    page = await context.newPage();
    page.setDefaultTimeout(limit);
    page.setDefaultNavigationTimeout(limit);
    page.on('pageerror', error => evidence.pageErrors.push(errorValue(error)));
    page.on('dialog', dialog => {
      evidence.dialogs.push({type: dialog.type(), message: dialog.message(), action: 'accept'});
      pending.push(dialog.accept().catch(error => evidence.recorderErrors.push(errorValue(error))));
    });
    page.on('request', request => evidence.http.push({event: 'request', url: request.url(), method: request.method(),
      headers: request.headers(), text: request.postData(), at: new Date().toISOString()}));
    page.on('response', response => {
      const event = {event: 'response', url: response.url(), method: response.request().method(),
        status: response.status(), headers: response.headers(), at: new Date().toISOString()};
      evidence.http.push(event);
      pending.push((async () => {
        event.text = await response.text();
        if (new URL(response.url()).pathname.startsWith('/api/')) event.value = JSON.parse(event.text);
      })().catch(error => evidence.recorderErrors.push({url: event.url, ...errorValue(error)})));
    });
    page.on('requestfailed', request => evidence.http.push({event: 'failed', url: request.url(),
      method: request.method(), text: request.postData(), failure: request.failure(), at: new Date().toISOString()}));
    page.on('requestfinished', request => evidence.http.push({event: 'finished', url: request.url(),
      method: request.method(), at: new Date().toISOString()}));

    phase = '初次读取及正常键盘编辑';
    const initialResponse = nextResponse('GET', '/api/work');
    await page.goto(evidence.url);
    evidence.initialResponse = await responseValue(initialResponse);
    await ready();
    const c = controls(page);
    await page.getByRole('navigation', {name: '章节', exact: true}).locator('button[data-number="2"]').click();
    await checkpoint('initial');
    await keyboardAppend(page, additions.before, evidence, 'before');
    await checkpoint('afterKeyboard');
    evidence.beforeComparison = {expected: evidence.expectedA, actual: values(evidence.states.afterKeyboard),
      matches: isDeepStrictEqual(values(evidence.states.afterKeyboard), evidence.expectedA)};
    await record();
    const comparison = nextResponse('GET', '/api/work');
    await c.reload.click();
    evidence.comparisonResponse = await responseValue(comparison);
    await ready();
    await checkpoint('beforeSave');

    phase = 'POST 等待与键盘尝试';
    // 初次读取、选章、完整 A 核对及对照结束之后才安装门。
    const post = await gate(page, /\/api\/draft(?:\?|$)/, 'POST', 'POST', evidence, gates);
    const get = await gate(page, /\/api\/work(?:\?|$)/, 'GET', 'GET读回', evidence, gates);
    await c.save.click();
    await post.wait();
    await checkpoint('postEntered');
    evidence.databaseAtPostGate = database(store, id);
    evidence.serverAtPostGate = structuredClone(evidence.serverRequests);
    await keyboardAppend(page, additions.post, evidence, 'post');
    await checkpoint('postWaiting');

    phase = '释放 POST、真实返回及 GET 等待';
    const postResponse = nextResponse('POST', '/api/draft');
    post.release();
    evidence.postResponse = await responseValue(postResponse);
    await get.wait();
    await checkpoint('getEnteredAfterPostReturned');
    evidence.databaseWhileGetWaits = database(store, id);
    await keyboardAppend(page, additions.get, evidence, 'get');
    await checkpoint('getWaiting');

    phase = '释放 GET、读回及恢复编辑';
    const readback = nextResponse('GET', '/api/work');
    get.release();
    evidence.readbackResponse = await responseValue(readback);
    await ready();
    await checkpoint('completed');
    evidence.databaseAfterSave = database(store, id);
    await keyboardAppend(page, additions.after, evidence, 'after');
    await checkpoint('editableAfterSave');

    phase = '刷新及完整存储核对';
    const refresh = nextResponse('GET', '/api/work');
    await page.reload();
    evidence.refreshResponse = await responseValue(refresh);
    await ready();
    await checkpoint('refreshed');
    evidence.databaseFinal = database(store, id);
    evidence.observationComplete = true;
  } catch (error) {
    (phase === '环境初始化' ? evidence.environmentErrors : evidence.observationErrors).push({phase, ...errorValue(error)});
  } finally {
    // 先释放两门；每个清理动作单独记录，失败也继续关闭后续资源。
    for (const g of gates) g.release();
    const cleanup = async (name, action) => {
      const item = {name, startedAt: new Date().toISOString()};
      evidence.cleanup.push(item);
      try { await bounded(Promise.resolve().then(action), name); item.passed = true; }
      catch (error) { item.passed = false; evidence.cleanupErrors.push({name, ...errorValue(error)}); }
      item.finishedAt = new Date().toISOString();
    };
    for (const g of gates) await cleanup('路由门 ' + g.record.name, () => g.settle());
    if (page) await cleanup('撤销路由', () => page.unrouteAll({behavior: 'wait'}));
    const drain = async () => {
      while (pending.length) await Promise.all(pending.splice(0));
    };
    await cleanup('读取响应记录', drain);
    if (context) await cleanup('关闭上下文', () => context.close());
    if (browser) await cleanup('关闭浏览器', () => browser.close());
    await cleanup('收尾事件记录', drain);
    if (server?.listening) await cleanup('关闭 HTTP 服务', () => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    }));
    if (store) await cleanup('关闭 Store', () => store.close());
    evidence.cleanupComplete = evidence.cleanupErrors.length === 0;
    evidence.finishedAt = new Date().toISOString();
    await record();
  }
}

// 时间由真实 Store 生成；其余全部字段按 fixture 和独立业务规则核对。
function withoutTimestamp(chapter) {
  const {updatedAt, ...value} = chapter;
  assert.equal(new Date(updatedAt).toISOString(), updatedAt);
  return value;
}

function verify(evidence) {
  const checks = [], errors = [];
  const check = (category, name, action) => {
    try { action(); checks.push({category, name, passed: true}); }
    catch (error) {
      checks.push({category, name, passed: false, error: errorValue(error)});
      errors.push(new Error(category + '：' + name, {cause: error}));
    }
  };
  for (const [category, field] of [
    ['环境', 'environmentErrors'], ['观察', 'observationErrors'], ['页面运行', 'pageErrors'],
    ['记录', 'recorderErrors'], ['清理', 'cleanupErrors'],
  ]) check(category, '无' + category + '错误', () => assert.deepEqual(evidence[field], []));
  check('观察', '完整观察结束', () => assert.equal(evidence.observationComplete, true));
  check('清理', '全部门已释放并收尾', () => {
    for (const g of evidence.gates) {
      assert.equal(g.released, true);
      assert.deepEqual(g.errors, []);
      if (g.entered) assert.equal(g.finished, true);
    }
    assert.equal(evidence.cleanupComplete, true);
  });
  if (!evidence.observationComplete) {
    checks.push({category: '业务', name: '未完成观察，业务结论待定', skipped: true});
    return {checks, errors};
  }

  const s = evidence.states, A = evidence.expectedA, initial = evidence.initial;
  const fixture = evidence.source.fixture, id = evidence.workId;
  const {revision, ...workSource} = fixture.work;
  const expectedWork = {...workSource, id, revision: 1};
  const expectedChapter = (number, saved = false) => ({
    workId: id, number, revision: saved ? 2 : 1,
    ...values(fixture.chapters.find(c => c.number === number)), ...(saved ? A : {}),
    status: 'draft', workRevision: 1, origin: 'human', taskId: null, threadId: null,
    previousRevisions: Array.from({length: number - 1}, (_, i) => ({number: i + 1, revision: 1})),
    reviewNote: null,
  });
  const savedChapter = chapter => assert.deepEqual(withoutTimestamp(chapter), expectedChapter(2, true));
  const httpWork = (response, saved) => {
    assert.equal(response.status, 200);
    assert.deepEqual(response.value.work, expectedWork);
    assert.deepEqual(response.value.chapters.map(c => c.number), [1, 2, 3]);
    for (const chapter of response.value.chapters) {
      const {basisCurrent, ...stored} = chapter;
      assert.equal(basisCurrent, !(saved && chapter.number === 3));
      assert.deepEqual(withoutTimestamp(stored), expectedChapter(chapter.number, saved && chapter.number === 2));
      assert.deepEqual(stored, saved && chapter.number === 2 ? evidence.postResponse.value :
        initial.chapters.find(c => c.number === chapter.number));
    }
  };
  const persisted = db => {
    const before = evidence.databaseBefore;
    assert.deepEqual(db.work, expectedWork);
    assert.deepEqual(db.chapters.map(c => c.number), [1, 2, 3]);
    savedChapter(db.chapters[1]);
    assert.deepEqual(db.chapters[1], evidence.postResponse.value);
    for (const table of ['works', 'work_versions', 'tasks']) assert.deepEqual(db.tables[table], before.tables[table]);
    assert.deepEqual(db.chapters.filter(c => c.number !== 2), initial.chapters.filter(c => c.number !== 2));
    assert.deepEqual(db.tables.chapters.filter(row => row.number !== 2), before.tables.chapters.filter(row => row.number !== 2));
    const current = db.tables.chapters.filter(row => row.number === 2);
    assert.deepEqual(current.map(row => ({work_id: row.work_id, number: row.number, revision: row.revision})),
      [{work_id: id, number: 2, revision: 2}]);
    assert.deepEqual(current[0].value, evidence.postResponse.value);
    const history = db.tables.chapter_versions;
    const newVersions = history.filter(row => row.number === 2 && row.revision === 2);
    assert.deepEqual(history.filter(row => !(row.number === 2 && row.revision === 2)), before.tables.chapter_versions);
    assert.deepEqual(newVersions, current);
  };
  const business = (name, action) => check('业务', name, action);
  business('完整作品与三章独立初始化为 r1/human/draft', () => {
    assert.deepEqual(initial.work, expectedWork);
    assert.deepEqual(initial.chapters.map(c => withoutTimestamp(c)), [1, 2, 3].map(n => expectedChapter(n)));
    assert.deepEqual(evidence.databaseBefore.work, expectedWork);
    assert.deepEqual(evidence.databaseBefore.chapters, initial.chapters);
    const tables = evidence.databaseBefore.tables;
    assert.deepEqual(tables.works.map(row => ({id: row.id, revision: row.revision, value: row.value})),
      [{id, revision: 1, value: {...workSource, id}}]);
    assert.deepEqual(tables.work_versions.map(row => ({work_id: row.work_id, revision: row.revision, value: row.value})),
      [{work_id: id, revision: 1, value: {...workSource, id}}]);
    assert.deepEqual(tables.chapters.map(row => ({work_id: row.work_id, number: row.number, revision: row.revision, value: row.value})),
      initial.chapters.map(ch => ({work_id: id, number: ch.number, revision: 1, value: ch})));
    assert.deepEqual(tables.chapter_versions, tables.chapters);
    assert.deepEqual(tables.tasks, []);
    httpWork(evidence.initialResponse, false);
  });
  business('正常键盘准确输入 A，先核对后重新读取，对照不覆盖本地 A', () => {
    assert.equal(s.initial.chapter, '第 2 章 · 当前草稿');
    assert.deepEqual(values(s.initial), values(fixture.chapters.find(c => c.number === 2)));
    assert.equal(evidence.beforeComparison.matches, true);
    assert.deepEqual(values(s.afterKeyboard), A);
    assert.deepEqual(values(s.beforeSave), A);
    assert.ok(evidence.keyboard.before.every(a => a.focused));
    assert.equal(s.beforeSave.buttons.overwrite.visible, true);
    assert.equal(s.beforeSave.comparison.body, fixture.chapters.find(c => c.number === 2).body);
    httpWork(evidence.comparisonResponse, false);
  });
  business('POST 门截到完整 A 和已读版本，尚未写入服务', () => {
    assert.deepEqual(evidence.gates[0].request.submitted, {
      workId: id, chapterNumber: 2, expectedWorkRevision: 1, expectedChapterRevision: 1,
      expectedPreviousRevisions: [{number: 1, revision: 1}], ...A,
    });
    assert.deepEqual(values(s.postEntered), A);
    assert.deepEqual(evidence.serverAtPostGate.filter(r => r.method === 'POST'), []);
    assert.deepEqual(evidence.databaseAtPostGate, evidence.databaseBefore);
  });
  for (const [phase, key] of [['postWaiting', 'post'], ['getWaiting', 'get']]) {
    business(phase + ' 每次正常键盘尝试均不能改变完整 A', () => {
      assert.deepEqual(values(s[phase]), A);
      assert.deepEqual(evidence.keyboard[key].map(a => a.field), ['title', 'body']);
      for (const attempt of evidence.keyboard[key]) {
        assert.deepEqual(values(attempt.before), A);
        assert.deepEqual(values(attempt.after), A);
        assert.equal(attempt.focused, false);
        assert.deepEqual(attempt.actions, ['locator.focus()', 'keyboard.press(Control+End)', 'keyboard.type(上述原文)']);
      }
    });
    business(phase + ' 暂停章名、正文及可见覆盖入口', () => {
      assert.equal(s[phase].titleEditable, false);
      assert.equal(s[phase].bodyEditable, false);
      assert.equal(s[phase].buttons.overwrite.visible, true);
      for (const button of ['save', 'reload', 'read', 'overwrite']) assert.equal(s[phase].buttons[button].enabled, false);
    });
  }
  business('POST 真实返回完整 human/draft r2，GET 门中服务已有完整 A/历史', () => {
    assert.equal(evidence.postResponse.status, 200);
    savedChapter(evidence.postResponse.value);
    assert.equal(evidence.gates[1].entered, true);
    assert.deepEqual(values(s.getEnteredAfterPostReturned), A);
    persisted(evidence.databaseWhileGetWaits);
  });
  business('真实 GET 读回与页面完整 A 一致', () => {
    httpWork(evidence.readbackResponse, true);
    assert.deepEqual(values(s.completed), A);
    assert.match(s.completed.status, /已保存.*读回/);
    persisted(evidence.databaseAfterSave);
  });
  business('读回完成后恢复章名/正文编辑，补记只留本地', () => {
    assert.ok(s.completed.titleEditable && s.completed.bodyEditable);
    assert.ok(s.completed.buttons.reload.enabled && s.completed.buttons.read.enabled && s.completed.buttons.overwrite.enabled);
    assert.ok(evidence.keyboard.after.every(a => a.focused));
    assert.deepEqual(values(s.editableAfterSave), append(A, additions.after));
    assert.equal(s.editableAfterSave.buttons.save.enabled, true);
  });
  business('刷新真实 GET、页面、五表与全部历史只保留 A，其他对象原样', () => {
    httpWork(evidence.refreshResponse, true);
    assert.deepEqual(values(s.refreshed), A);
    persisted(evidence.databaseFinal);
    assert.deepEqual(evidence.databaseFinal, evidence.databaseAfterSave);
    assert.deepEqual(evidence.serverRequests.filter(r => r.method === 'POST').map(r => ({url: r.url, status: r.status})),
      [{url: '/api/draft', status: 200}]);
    for (const g of evidence.gates) assert.equal(g.action, 'continue');
  });
  return {checks, errors};
}

test('交付：原版正常保存的等待期、读回、恢复编辑和持久化', {timeout: 300_000}, async () => {
  const dir = join(project, 'runs', 'delivery-saving-' + randomUUID());
  await mkdir(join(project, 'runs'), {recursive: true});
  await mkdir(dir);
  console.log('本次完整证据：' + dir);
  const evidence = {
    dir, variant: 'original', scenario: '保存及读回等待期间暂停编辑',
    startedAt: new Date().toISOString(), node: process.version, platform: process.platform,
    requestedChannel: process.env.DELIVERY_BROWSER_CHANNEL ?? null, additions,
    gates: [], states: {}, keyboard: {}, http: [], serverRequests: [], dialogs: [],
    environmentErrors: [], observationErrors: [], pageErrors: [], recorderErrors: [], cleanupErrors: [], cleanup: [],
  };
  let checks = [], errors = [];
  try {
    await observe(evidence);
    ({checks, errors} = verify(evidence));
  } catch (error) {
    checks.push({category: '检查执行', name: '检查入口异常', passed: false, error: errorValue(error)});
    errors.push(new Error('检查执行：入口异常', {cause: error}));
  }
  evidence.assertions = checks;
  evidence.testErrors = errors.map(error => ({...errorValue(error), cause: errorValue(error.cause)}));
  for (const check of checks) console.log(`${check.category} ${check.skipped ? '待定' : check.passed ? '通过' : '失败'}：${check.name}`);
  // 两个结果分别尝试写入；磁盘失败照样使 node:test 非零，不冒充业务红。
  for (const name of ['evidence.json', 'result.json']) {
    try { await json(join(dir, name), evidence); }
    catch (error) {
      evidence.recorderErrors.push({file: name, ...errorValue(error)});
      const failure = new Error('记录：最终落盘 ' + name, {cause: error});
      errors.push(failure);
      checks.push({category: '记录', name: '最终落盘 ' + name, passed: false, error: errorValue(error)});
      evidence.testErrors.push({...errorValue(failure), cause: errorValue(error)});
      console.error('结果文件写入失败：' + name, error);
    }
  }
  if (errors.length) throw new AggregateError(errors, '交付检查失败；按错误类别查看完整证据 ' + dir);
});
