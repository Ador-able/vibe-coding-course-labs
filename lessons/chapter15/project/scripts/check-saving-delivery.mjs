// 单例正常保存。观察与清理结束后统一断言；既有 test-saving.mjs 保持冻结。
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID, createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIMIT = 12_000;
const ACTION_LIMIT = 4_000;
const STEP_LIMIT = 30_000;
const OBSERVATION_LIMIT = 120_000;
const TEST_LIMIT = 420_000; // 另留时间完成清理和记录。
const sourcePaths = [
  'package.json', '../../../pnpm-lock.yaml', 'AGENTS.md', 'prototype/AGENTS.md',
  'prototype/app.js', 'prototype/index.html', 'prototype/app.css',
  'src/prototype-http.ts', 'src/store.ts', 'src/schemas.ts',
  'scripts/seed.mjs', 'scripts/test-saving.mjs', 'scripts/check-saving-delivery.mjs',
  'docs/workbench-boundaries.md', 'docs/save-review.md', 'docs/delivery-check.md',
  'inputs/完整教师初始化.json', 'inputs/独立业务预期.json',
  'inputs/输入冻结清单.json', 'inputs/凡人修仙传-三段原文.json',
  'inputs/177-完整交付任务.txt', 'inputs/177-前置实录索引.json', 'inputs/CI官方版本与范围.json',
  '../../../package.json', '../../../pnpm-workspace.yaml',
  '../../../.githooks/pre-commit', '../../../.github/workflows/chapter15-delivery.yml',
  'dist/store.js', 'dist/schemas.js', 'dist/prototype-http.js',
];
const planned = ['initial', 'selected', 'before', 'comparison', 'gatesInstalled',
  'postWait', 'postKeyboard', 'getWait', 'getKeyboard', 'readback', 'afterKeyboard', 'refresh'];
const now = () => new Date().toISOString();
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function errorRecord(error) {
  return {name: error?.name, message: String(error?.message ?? error),
    stack: error?.stack, code: error?.code, actual: error?.actual, expected: error?.expected};
}
function deferred() {
  let release;
  const promise = new Promise(resolvePromise => { release = resolvePromise; });
  return {promise, release};
}
async function bounded(promise, label, milliseconds = LIMIT) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}：超过 ${milliseconds} 毫秒`)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
function gitState(directory) {
  const commands = [
    ['root', ['rev-parse', '--show-toplevel']], ['head', ['rev-parse', 'HEAD']],
    ['branch', ['branch', '--show-current']], ['version', ['--version']],
    ['status', ['status', '--porcelain=v1', '--untracked-files=all']],
    ['untracked', ['ls-files', '--others', '--exclude-standard']],
  ];
  return Object.fromEntries(commands.map(([name, args]) => {
    const command = ['--no-optional-locks', '-c', 'core.excludesFile=',
      '-c', 'core.fsmonitor=false', '-c', 'core.quotepath=false', ...args];
    try {
      const result = spawnSync('git', command, {cwd: project, encoding: 'utf8',
        timeout: LIMIT, windowsHide: true, maxBuffer: 8 * 1024 * 1024,
        // 使用本次运行目录内不存在的路径，避免读取私密全局 Git 配置。
        // 脚本不会创建这个配置路径。
        env: {...process.env, GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: resolve(directory, 'no-global-config')},
        stdio: ['ignore', 'pipe', 'pipe']});
      const entry = {command, stdout: String(result.stdout ?? ''), stderr: String(result.stderr ?? ''),
        exitCode: result.status, signal: result.signal};
      if (result.error || result.status !== 0) {
        entry.error = errorRecord(result.error ?? new Error(`Git ${name} 退出 ${result.status}，signal=${result.signal}`));
        entry.error.stderr = entry.stderr;
      }
      return [name, entry];
    } catch (error) {
      return [name, {command, error: errorRecord(error),
        stdout: String(error.stdout ?? ''), stderr: String(error.stderr ?? '')}];
    }
  }));
}
function readSources(report) {
  for (const path of sourcePaths) {
    try {
      const bytes = readFileSync(resolve(project, path));
      report.sources[path] = {path, bytes: bytes.length, sha256: sha256(bytes),
        utf8: bytes.toString('utf8'), base64: bytes.toString('base64')};
    } catch (error) {
      report.sources[path] = {path, error: errorRecord(error)};
      report.environmentErrors.push({path, error: errorRecord(error)});
    }
  }
  const lock = readFileSync(resolve(project, '../../../pnpm-lock.yaml'));
  report.environment.lock = {bytes: lock.length, sha256: sha256(lock)};
}
function instrumentServer(server, report) {
  // 在真实 HTTP 处理器的 IncomingMessage/ServerResponse 上记录。
  // 只记录流字节和 finish/abort，不另行响应请求。
  server.prependListener('request', (request, response) => {
    const entry = {id: report.service.length + 1, receivedAt: now(),
      method: request.method, url: request.url, headers: request.headers,
      rawHeaders: request.rawHeaders, httpVersion: request.httpVersion};
    report.service.push(entry);
    const requestChunks = [], responseChunks = [];
    request.on('data', chunk => requestChunks.push(Buffer.from(chunk)));
    const saveRequest = () => {
      const bytes = Buffer.concat(requestChunks);
      entry.requestBody = bytes.toString('utf8');
      entry.requestBase64 = bytes.toString('base64');
    };
    request.on('end', () => { saveRequest(); entry.requestEndedAt = now(); });
    request.on('aborted', () => { saveRequest(); entry.abortedAt = now(); });
    request.on('error', error => {
      entry.requestError = errorRecord(error);
      report.recordingErrors.push({kind: 'HTTP request stream', id: entry.id, error: entry.requestError});
    });
    const remember = (chunk, encoding) => {
      if (chunk !== undefined && chunk !== null && typeof chunk !== 'function') {
        responseChunks.push(Buffer.isBuffer(chunk) ? Buffer.from(chunk)
          : Buffer.from(chunk, typeof encoding === 'string' ? encoding : undefined));
      }
    };
    const originalWrite = response.write, originalEnd = response.end;
    response.write = function(chunk, encoding, callback) {
      remember(chunk, encoding);
      return originalWrite.call(this, chunk, encoding, callback);
    };
    response.end = function(chunk, encoding, callback) {
      remember(chunk, encoding);
      return originalEnd.call(this, chunk, encoding, callback);
    };
    const saveResponse = () => {
      const bytes = Buffer.concat(responseChunks);
      entry.response = {status: response.statusCode, headers: response.getHeaders(),
        body: bytes.toString('utf8'), base64: bytes.toString('base64'),
        writableFinished: response.writableFinished};
    };
    response.on('finish', () => { saveResponse(); entry.finishedAt = now(); });
    response.on('close', () => { saveRequest(); saveResponse(); entry.closedAt = now(); });
    response.on('error', error => {
      entry.responseError = errorRecord(error);
      report.recordingErrors.push({kind: 'HTTP response stream', id: entry.id, error: entry.responseError});
    });
  });
  server.on('error', error => report.environmentErrors.push({kind: 'HTTP', error: errorRecord(error)}));
}
function instrumentPage(page, report, captures) {
  const requests = new WeakMap();
  page.on('request', request => {
    const entry = {id: report.browserNetwork.length + 1, at: now(),
      method: request.method(), url: request.url(), resourceType: request.resourceType(),
      headers: request.headers(), body: request.postData(),
      bodyBase64: request.postDataBuffer()?.toString('base64') ?? null};
    requests.set(request, entry);
    report.browserNetwork.push(entry);
    const job = (async () => {
      entry.headers = await request.allHeaders();
      entry.rawHeaders = await request.headersArray();
    })().catch(error => report.recordingErrors.push({kind: 'request headers', error: errorRecord(error)}));
    captures.add(job);
    void job.finally(() => captures.delete(job));
  });
  page.on('response', response => {
    const job = (async () => {
      const entry = requests.get(response.request());
      if (!entry) throw new Error('响应没有对应的请求记录');
      entry.response = {at: now(), url: response.url(), status: response.status(),
        headers: await response.allHeaders(), rawHeaders: await response.headersArray()};
      const bytes = await response.body();
      entry.response.body = bytes.toString('utf8');
      entry.response.base64 = bytes.toString('base64');
      entry.response.completedAt = now();
    })().catch(error => report.recordingErrors.push({kind: 'response', error: errorRecord(error)}));
    captures.add(job);
    void job.finally(() => captures.delete(job));
  });
  page.on('requestfailed', request => {
    const entry = requests.get(request);
    if (entry) entry.failed = {at: now(), ...request.failure()};
  });
  page.on('pageerror', error => report.pageErrors.push(errorRecord(error)));
  page.on('console', message => report.console.push({at: now(), type: message.type(), text: message.text()}));
  page.on('dialog', dialog => {
    report.dialogs.push({at: now(), type: dialog.type(), message: dialog.message(), action: 'accept'});
    // 刷新时确认离开带有本地编辑的页面，不保存这些编辑。
    const job = dialog.accept().catch(error => report.recordingErrors.push({kind: 'dialog', error: errorRecord(error)}));
    captures.add(job);
    void job.finally(() => captures.delete(job));
  });
}
async function pageState(page, report, label) {
  const state = await page.evaluate(() => {
    const element = id => document.getElementById(id);
    const field = id => {
      const node = element(id);
      return {id, value: node.value, disabled: node.disabled, readOnly: node.readOnly,
        hidden: node.hidden, visible: !!node.getClientRects().length,
        selectionStart: node.selectionStart, selectionEnd: node.selectionEnd};
    };
    const active = document.activeElement;
    return {url: location.href, title: document.title, scroll: {x: scrollX, y: scrollY},
      focus: {id: active?.id, tag: active?.tagName, value: active?.value,
        text: active?.textContent, outerHTML: active?.outerHTML},
      fields: {title: field('draft-title'), body: field('draft-body'), remote: field('remote-body')},
      comparison: {hidden: element('comparison').hidden, heading: element('remote-heading').textContent},
      message: {text: element('message').textContent, kind: element('message').dataset.kind},
      errorCode: element('error-code').textContent, revision: element('revision').textContent,
      editState: element('edit-state').textContent, chapterLabel: element('chapter-label').textContent,
      text: document.body.innerText, html: document.documentElement.outerHTML};
  });
  state.fields.title.editable = await page.locator('#draft-title').isEditable();
  state.fields.body.editable = await page.locator('#draft-body').isEditable();
  // 隐藏控件只用于观察，不操作。
  state.buttons = await page.getByRole('button', {includeHidden: true}).evaluateAll(nodes =>
    nodes.map(node => ({id: node.id, text: node.textContent, disabled: node.disabled,
      hidden: node.hidden, visible: !!node.getClientRects().length,
      chapter: node.dataset.number, current: node.getAttribute('aria-current')})));
  const entry = {label, at: now(), ...state};
  report.pages.push(entry);
  return entry;
}
async function keyboardText(page, text) {
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index++) {
    if (index) await page.keyboard.press('Enter');
    if (lines[index]) await page.keyboard.type(lines[index]);
  }
}
async function attemptPair(page, report, phase, edits) {
  const result = {phase, input: structuredClone(edits), fields: {}};
  for (const [field, id] of [['title', 'draft-title'], ['body', 'draft-body']]) {
    const entry = {input: edits[field]};
    result.fields[field] = entry;
    await page.locator(`#${id}`).scrollIntoViewIfNeeded({timeout: ACTION_LIMIT});
    entry.before = await pageState(page, report, `${phase}/${field}/before`);
    const box = await page.locator(`#${id}`).boundingBox();
    if (!box) throw new Error(`${phase}：${id} 没有可见的鼠标目标`);
    entry.pointerTarget = box;
    // 使用真实鼠标和键盘，观察禁用字段是否拒绝焦点和输入。
    // 不使用 fill、DOM 赋值或强制操作。
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    entry.focused = await pageState(page, report, `${phase}/${field}/pointer`);
    await page.keyboard.press('ControlOrMeta+End');
    entry.atEnd = await pageState(page, report, `${phase}/${field}/end`);
    await keyboardText(page, edits[field]);
    entry.after = await pageState(page, report, `${phase}/${field}/typed`);
  }
  result.after = await pageState(page, report, `${phase}/complete`);
  return result;
}
function databaseState(store, snapshot, workId, report, label) {
  const fiveTables = snapshot(store);
  const value = {label, at: now(), fiveTables, currentWork: store.getWork(workId),
    workHistory: fiveTables.work_versions.map(row => ({...row, parsed: JSON.parse(row.content)})),
    currentChapters: store.listChapters(workId).map(item => store.getChapter(workId, item.number)),
    chapterHistory: fiveTables.chapter_versions.map(row => ({...row, parsed: JSON.parse(row.content)})),
    export: store.exportWork(workId)};
  report.databases.push(value);
  return value;
}
function makeGate(name, report) {
  const hit = deferred(), release = deferred();
  const entry = {name, hits: []};
  report.gates.push(entry);
  return {hit, release, entry, arrive(request) {
    const value = {at: now(), method: request.method(), url: request.url(), body: request.postData()};
    entry.hits.push(value);
    hit.release(value);
  }, open(reason) {
    entry.releases ??= [];
    entry.releases.push({at: now(), reason});
    release.release();
  }};
}

// 缺少必要对象直接失败，不把两个 undefined 相等当成证据。
function required(value, label) {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} 缺少必要对象`);
  return value;
}
function one(items, predicate, label) {
  assert.ok(Array.isArray(items), `${label} 缺少数组`);
  const matches = items.filter(predicate);
  assert.equal(matches.length, 1, `${label} 必须恰有一项`);
  return required(matches[0], label);
}
const pairChapter = chapter => ({title: chapter.title, body: chapter.body});
const pair = state => ({title: state.fields.title.value, body: state.fields.body.value});
const plus = (base, edits) => ({title: base.title + edits.title, body: base.body + edits.body});
const postRequests = report => report.service.filter(item => item.method === 'POST' && item.url === '/api/draft');
const button = (state, id) => one(state.buttons, item => item.id === id, `按钮 ${id}`);
function check(report, name, action) {
  try { action(); report.assertions.push({name, passed: true}); }
  catch (error) { report.assertions.push({name, passed: false, error: errorRecord(error)}); }
}
function expectedChapter(input, A, number, saved) {
  const original = one(input.chapters, chapter => chapter.number === number, `冻结第 ${number} 章`);
  return {workId: input.work.id, number, revision: saved && number === 2 ? 2 : 1,
    ...(saved && number === 2 ? A : pairChapter(original)), status: 'draft', origin: 'human',
    workRevision: 1, taskId: null, threadId: null, reviewNote: null,
    previousRevisions: input.chapters.filter(chapter => chapter.number < number)
      .map(chapter => ({number: chapter.number, revision: 1}))};
}
function assertChapter(actual, expected) {
  required(actual, '完整章节');
  const {updatedAt, ...content} = actual;
  assert.equal(typeof updatedAt, 'string');
  assert.match(updatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.ok(Number.isFinite(Date.parse(updatedAt)));
  assert.deepStrictEqual(content, expected);
}
function assertDatabase(value, input, A, saved) {
  required(value, '数据库快照');
  const tables = required(value.fiveTables, '五表');
  assert.deepStrictEqual(Object.keys(tables), ['works', 'work_versions', 'chapters', 'chapter_versions', 'tasks']);
  for (const rows of Object.values(tables)) assert.ok(Array.isArray(rows));
  assert.deepStrictEqual(tables.works, [{id: input.work.id, revision: 1, content: JSON.stringify(input.work)}]);
  assert.deepStrictEqual(tables.work_versions, [{work_id: input.work.id, revision: 1, content: JSON.stringify(input.work)}]);
  assert.deepStrictEqual(tables.tasks, []);
  assert.deepStrictEqual(tables.chapters.map(row => row.number), [1, 2, 3]);
  assert.deepStrictEqual(tables.chapter_versions.map(row => [row.number, row.revision]),
    saved ? [[1, 1], [2, 1], [2, 2], [3, 1]] : [[1, 1], [2, 1], [3, 1]]);
  assert.deepStrictEqual(value.currentWork, {...input.work, revision: 1});
  assert.equal(value.currentChapters.length, 3);
  for (const number of [1, 2, 3]) {
    const current = one(value.currentChapters, chapter => chapter.number === number, `库当前第 ${number} 章`);
    assertChapter(current, expectedChapter(input, A, number, saved));
    const row = one(tables.chapters, row => row.number === number, `chapters/${number}`);
    assert.equal(row.work_id, input.work.id);
    assert.equal(row.revision, current.revision);
    assert.deepStrictEqual(JSON.parse(row.content), current);
    const history = one(tables.chapter_versions,
      item => item.number === number && item.revision === current.revision, `当前历史/${number}`);
    assert.deepStrictEqual(history, row);
  }
  for (const row of tables.chapter_versions) {
    assert.equal(row.work_id, input.work.id);
    const chapter = JSON.parse(row.content);
    assert.equal(chapter.revision, row.revision);
    assertChapter(chapter, expectedChapter(input, A, row.number, row.revision === 2));
  }
  const exported = required(value.export, '完整导出');
  assert.equal(exported.workId, input.work.id);
  assert.equal(exported.workRevision, 1);
  assert.equal(exported.expectedChapters, 3);
  assert.equal(exported.savedChapters, 3);
  assert.equal(exported.allOutlineChaptersSaved, true);
  assert.deepStrictEqual(exported.chapters, [1, 2, 3].map(number => {
    const expected = expectedChapter(input, A, number, saved);
    return {number, revision: expected.revision, status: 'draft', workRevision: 1,
      previousRevisions: expected.previousRevisions, reviewNote: null, basisCurrent: !saved || number !== 3};
  }));
  const expectedText = `# ${input.work.title}\n\n用途：${input.work.purpose}\n\n` + [1, 2, 3].map(number => {
    const chapter = expectedChapter(input, A, number, saved), current = !saved || number !== 3;
    return `## 第 ${number} 章 ${chapter.title}\n\n状态：draft，正文 r${chapter.revision}；${current ? '资料基线一致，品质仍需人判断' : '资料有变动，需重新核对'}。\n\n${chapter.body}\n`;
  }).join('\n');
  assert.equal(exported.text, expectedText);
}
function collectAssertions(report, observed, input, expectation, A, finalDb) {
  for (const key of ['environmentErrors', 'observationErrors', 'recordingErrors', 'cleanupErrors', 'pageErrors', 'sourceChanges']) {
    check(report, `${key} 为空`, () => assert.deepStrictEqual(report[key], []));
  }
  check(report, '全部观察完成且对象存在', () => {
    assert.deepStrictEqual(report.completed, planned);
    assert.deepStrictEqual(report.unfinished, []);
    for (const name of planned) required(observed[name], `观察 ${name}`);
  });
  for (const moment of ['gitBefore', 'gitAfter']) check(report, `${moment} 真实Git记录`, () => {
    const state = required(report.environment[moment], moment);
    for (const name of ['root', 'head', 'branch', 'version', 'status', 'untracked']) {
      const entry = required(state[name], `${moment}/${name}`);
      assert.equal(Object.hasOwn(entry, 'error'), false);
      assert.equal(typeof entry.stdout, 'string');
      assert.equal(typeof entry.stderr, 'string');
      assert.equal(entry.exitCode, 0);
    }
    assert.match(state.head.stdout.trim(), /^[0-9a-f]{40,64}$/);
    assert.ok(state.root.stdout.trim().length > 0);
  });
  check(report, '完整冻结输入、独立全文预期和真实来源', () => {
    required(input, '教师初始化'); required(expectation, '独立业务预期'); required(A, '独立完整A');
    assert.deepStrictEqual(input.chapters.map(chapter => chapter.number), [1, 2, 3]);
    assert.equal(expectation.chapterNumber, 2);
    assert.equal(input.kind, 'teacher_initialization');
    assert.equal(expectation.kind, 'teacher_test_expectation');
    for (const chapter of input.chapters) for (const field of ['title', 'body']) {
      assert.equal(typeof chapter[field], 'string'); assert.ok(chapter[field].length > 0);
    }
    for (const phase of ['before', 'post', 'get', 'after']) for (const field of ['title', 'body']) {
      assert.equal(typeof expectation.edits[phase][field], 'string');
      assert.ok(expectation.edits[phase][field].length > 0);
    }
    required(expectation.expectedA, '冻结完整预期A');
    assert.deepStrictEqual(A, expectation.expectedA);
    const manifest = JSON.parse(report.sources['inputs/输入冻结清单.json'].utf8);
    for (const path of ['完整教师初始化.json', '独立业务预期.json', '凡人修仙传-三段原文.json']) {
      const frozen = one(manifest.files, item => item.path === path, `冻结清单/${path}`);
      const source = required(report.sources[`inputs/${path}`], path);
      assert.match(source.sha256, /^[0-9a-f]{64}$/);
      assert.equal(source.sha256, frozen.sha256); assert.equal(source.bytes, frozen.bytes);
      assert.equal(sha256(Buffer.from(source.base64, 'base64')), frozen.sha256);
    }
    assert.equal(report.sources['inputs/凡人修仙传-三段原文.json'].sha256, input.source.sha256);
    assert.equal(report.sources['inputs/凡人修仙传-三段原文.json'].bytes, input.source.bytes);
    const seeded = required(report.initialization, '真实seed结果');
    assert.equal(seeded.inputSha256, report.sources['inputs/完整教师初始化.json'].sha256);
    assert.deepStrictEqual({kind: seeded.kind, source: seeded.source, scope: seeded.scope},
      {kind: input.kind, source: input.source, scope: input.scope});
    assert.deepStrictEqual(seeded.work, {...input.work, revision: 1});
    assert.equal(seeded.chapters.length, 3);
    for (const number of [1, 2, 3]) assertChapter(
      one(seeded.chapters, chapter => chapter.number === number, `seed/${number}`), expectedChapter(input, A, number, false));
  });
  check(report, '五表完整seed与POST门前无写入', () => {
    const initial = one(report.databases, value => value.label === 'seed', 'seed快照');
    assertDatabase(initial, input, A, false);
    const waiting = required(observed.postWait, 'POST等待');
    assert.equal(waiting.servicePostCount, 0);
    assertDatabase(waiting.database, input, A, false);
    assert.deepStrictEqual(waiting.database.fiveTables, initial.fiveTables);
  });
  check(report, '保存前正常键盘和已有对照保留完整A', () => {
    const before = required(observed.before, '保存前键盘');
    assert.deepStrictEqual(pair(before.after), A);
    const comparison = required(observed.comparison, '对照');
    assert.deepStrictEqual(pair(comparison), A);
    assert.equal(comparison.comparison.hidden, false);
    assert.equal(comparison.fields.remote.value, input.chapters[1].body);
  });
  for (const phase of ['post', 'get']) {
    for (const field of ['title', 'body']) {
      check(report, `${phase}等待/${field}禁用且不可编辑`, () => {
        const attempt = required(observed[`${phase}Keyboard`], `${phase}键盘`);
        const item = required(attempt.fields[field], `${phase}/${field}`);
        assert.equal(item.before.fields[field].disabled, true);
        assert.equal(item.before.fields[field].editable, false);
      });
      check(report, `${phase}等待/${field}不能取得焦点且完整A未变`, () => {
        const attempt = required(observed[`${phase}Keyboard`], `${phase}键盘`);
        const item = required(attempt.fields[field], `${phase}/${field}`);
        required(item.focused.focus, '真实焦点');
        assert.equal(typeof item.focused.focus.id, 'string');
        assert.notEqual(item.focused.focus.id, `draft-${field}`);
        assert.deepStrictEqual(pair(item.before), A);
        assert.deepStrictEqual(pair(item.after), A);
      });
    }
    check(report, `${phase}等待覆盖、导航、保存和读取暂停，门恰命中一次`, () => {
      const attempt = required(observed[`${phase}Keyboard`], `${phase}键盘`);
      assert.deepStrictEqual(pair(attempt.after), A);
      assert.equal(button(attempt.after, 'use-current').disabled, true);
      const controls = attempt.after.buttons.filter(item => item.chapter || ['save', 'reload', 'read-current'].includes(item.id));
      assert.equal(controls.length, 6);
      assert.ok(controls.every(item => item.disabled === true));
      const gate = one(report.gates, gate => gate.name === phase, `${phase}门`);
      assert.equal(gate.hits.length, 1);
      assert.equal(typeof gate.continuedAt, 'string');
    });
  }
  check(report, 'GET门期间真实POST已保存完整A和一次r2', () => {
    const waiting = required(observed.getWait, 'GET等待');
    assert.equal(waiting.servicePostCount, 1);
    assertDatabase(waiting.database, input, A, true);
  });
  check(report, '完整读回后恢复编辑，刷新丢弃本地补记并保留A', () => {
    const readback = required(observed.readback, '读回');
    assert.deepStrictEqual(pair(readback), A);
    assert.equal(readback.message.text, '已保存 r2。');
    assert.equal(readback.comparison.hidden, true); assert.equal(readback.editState, '');
    const after = required(observed.afterKeyboard, '恢复键盘');
    for (const field of ['title', 'body']) {
      assert.equal(readback.fields[field].disabled, false);
      assert.equal(after.fields[field].before.fields[field].editable, true);
      assert.equal(after.fields[field].focused.focus.id, `draft-${field}`);
    }
    assert.equal(button(readback, 'use-current').disabled, false);
    assert.deepStrictEqual(pair(after.after), plus(A, expectation.edits.after));
    assert.equal(button(after.after, 'save').disabled, false);
    assert.deepStrictEqual(pair(required(observed.refresh, '刷新')), A);
  });
  check(report, '五表最终历史与观察结束一致，原r1及其他章节原字节不变', () => {
    assertDatabase(finalDb, input, A, true);
    const initial = one(report.databases, value => value.label === 'seed', 'seed快照');
    const complete = one(report.databases, value => value.label === 'observations complete', '观察结束库');
    assert.deepStrictEqual(finalDb.fiveTables, complete.fiveTables);
    assert.deepStrictEqual(finalDb.fiveTables.works, initial.fiveTables.works);
    assert.deepStrictEqual(finalDb.fiveTables.work_versions, initial.fiveTables.work_versions);
    assert.deepStrictEqual(finalDb.fiveTables.chapter_versions.filter(row => row.revision === 1), initial.fiveTables.chapter_versions);
    for (const number of [1, 3]) for (const table of ['chapters', 'chapter_versions']) {
      assert.deepStrictEqual(finalDb.fiveTables[table].filter(row => row.number === number), initial.fiveTables[table].filter(row => row.number === number));
    }
  });
  check(report, '一次完整POST、全部真实API请求响应和四次完整读回', () => {
    required(input, '完整初始化'); required(A, '完整A'); required(finalDb, '最终库');
    const requestExpected = {workId: input.work.id, chapterNumber: 2, expectedWorkRevision: 1,
      expectedChapterRevision: 1, expectedPreviousRevisions: [{number: 1, revision: 1}], ...A};
    const post = one(postRequests(report), () => true, '真实服务POST');
    assert.deepStrictEqual(JSON.parse(post.requestBody), requestExpected);
    assert.equal(post.response.status, 200);
    assertChapter(JSON.parse(post.response.body), expectedChapter(input, A, 2, true));
    assert.deepStrictEqual(JSON.parse(post.response.body), one(finalDb.currentChapters, chapter => chapter.number === 2, '最终第2章'));
    const api = report.service.filter(entry => entry.url.startsWith('/api/'));
    assert.equal(api.length, 5);
    const browserApi = report.browserNetwork.filter(entry => new URL(entry.url).pathname.startsWith('/api/'));
    assert.equal(browserApi.length, 5);
    const remaining = [...browserApi];
    for (const entry of api) {
      assert.equal(entry.response.status, 200); assert.equal(entry.response.writableFinished, true);
      assert.equal(typeof entry.requestBody, 'string');
      assert.equal(typeof entry.requestBase64, 'string');
      assert.equal(typeof entry.finishedAt, 'string');
      assert.deepStrictEqual(Buffer.from(entry.requestBase64, 'base64'), Buffer.from(entry.requestBody));
      assert.deepStrictEqual(Buffer.from(entry.response.base64, 'base64'), Buffer.from(entry.response.body));
      const index = remaining.findIndex(item => item.method === entry.method &&
        new URL(item.url).pathname + new URL(item.url).search === entry.url &&
        item.response && item.response.body === entry.response.body);
      assert.ok(index >= 0, `服务请求 ${entry.id} 缺少完整浏览器响应`);
      const [browserEntry] = remaining.splice(index, 1);
      assert.equal(Object.hasOwn(browserEntry, 'failed'), false);
      assert.equal(browserEntry.response.status, 200);
      assert.equal(typeof browserEntry.response.completedAt, 'string');
      assert.ok(Array.isArray(browserEntry.rawHeaders));
      assert.ok(Array.isArray(browserEntry.response.rawHeaders));
      assert.deepStrictEqual(Buffer.from(browserEntry.response.base64, 'base64'), Buffer.from(entry.response.base64, 'base64'));
      assert.equal(browserEntry.body, entry.method === 'POST' ? entry.requestBody : null);
      if (entry.method === 'POST') assert.deepStrictEqual(Buffer.from(browserEntry.bodyBase64, 'base64'), Buffer.from(entry.requestBase64, 'base64'));
    }
    assert.equal(remaining.length, 0);
    const reads = api.filter(entry => entry.method === 'GET');
    assert.equal(reads.length, 4);
    assert.equal(reads.filter(entry => entry.id < post.id).length, 2);
    assert.equal(reads.filter(entry => entry.id > post.id).length, 2);
    for (const read of reads) {
      const value = JSON.parse(read.response.body), saved = read.id > post.id;
      assert.deepStrictEqual(value.work, {...input.work, revision: 1});
      assert.deepStrictEqual(value.chapters.map(chapter => chapter.number), [1, 2, 3]);
      for (const number of [1, 2, 3]) {
        const chapter = one(value.chapters, chapter => chapter.number === number, `GET/${number}`);
        const {basisCurrent, ...content} = chapter;
        assertChapter(content, expectedChapter(input, A, number, saved));
        assert.equal(basisCurrent, !saved || number !== 3);
      }
    }
  });
}

async function runDelivery() {
  const id = randomUUID(), directory = resolve(project, 'runs', `delivery-saving-${id}`);
  const database = resolve(directory, 'practice.sqlite'), recordPath = resolve(directory, 'record.json');
  const report = {kind: 'saving_delivery_observation', id, scenario: 'normal', startedAt: now(),
    directory, database, recordPath,
    scope: '完整三章来自既有课堂存档；seed新作品及human/draft r1，仅正常保存一次。B正式采用第二章待内容负责人决定，未领取。',
    limits: ['无自动重试、回退或第二个浏览器实例。',
      '未覆盖服务前abort、已提交后GET失败、未知终态、真实并发、所有空白字符。',
      '本检查不判断单一工作台辨认、审美或文学采用；普通Hook检查工作区。'],
    environment: {cwd: process.cwd(), project, node: process.version, platform: process.platform, arch: process.arch,
      deliveryBrowserChannel: process.env.DELIVERY_BROWSER_CHANNEL ?? null,
      github: {event: process.env.GITHUB_EVENT_NAME ?? null, eventSha: process.env.GITHUB_SHA ?? null,
        prHead: process.env.DELIVERY_PR_HEAD ?? null, prBase: process.env.DELIVERY_PR_BASE ?? null},
      waitLimitsMs: {action: ACTION_LIMIT, request: LIMIT, step: STEP_LIMIT, observations: OBSERVATION_LIMIT, nodeTest: TEST_LIMIT}},
    sources: {}, pages: [], databases: [], service: [], browserNetwork: [], gates: [], console: [], dialogs: [],
    pageErrors: [], assertions: [], completed: [], environmentErrors: [], observationErrors: [],
    recordingErrors: [], cleanupErrors: [], cleanup: [], sourceChanges: []};
  let store, server, browser, context, page, seedModule, input, expectation, A, finalDb;
  const observed = {}, captures = new Set(), routeTasks = new Set();
  const observationDeadline = Date.now() + OBSERVATION_LIMIT;
  const postGate = makeGate('post', report), getGate = makeGate('get', report);
  let postUsed = false, getUsed = false, saveReadArmed = false;
  function persist(label) {
    report.lastCheckpoint = {label, at: now()};
    report.unfinished = planned.filter(step => !report.completed.includes(step));
    report.observed = observed;
    try { writeFileSync(recordPath, JSON.stringify(report, null, 2) + '\n', 'utf8'); return true; }
    catch (error) {
      report.recordingErrors.push({kind: 'write', label, recordPath, error: errorRecord(error)});
      process.stderr.write(`记录写入失败：${recordPath}：${error.message}\n`);
      return false;
    }
  }
  async function step(name, action) {
    report.activeStep = name;
    const remaining = observationDeadline - Date.now();
    if (remaining <= 0) throw new Error('观察时间已用完，开始清理并保留未完成条件。');
    observed[name] = await bounded(Promise.resolve().then(action), `observation/${name}`, Math.min(STEP_LIMIT, remaining));
    report.completed.push(name); persist(name); return observed[name];
  }
  async function cleanup(name, action) {
    const entry = {name, startedAt: now()}; report.cleanup.push(entry);
    try { await bounded(Promise.resolve().then(action), `cleanup/${name}`); entry.completedAt = now(); }
    catch (error) { report.cleanupErrors.push({name, error: errorRecord(error)}); }
  }
  const trackedRoute = action => route => {
    const job = action(route).catch(error => report.observationErrors.push({step: 'route', error: errorRecord(error)}));
    routeTasks.add(job); void job.finally(() => routeTasks.delete(job)); return job;
  };
  try {
    mkdirSync(resolve(project, 'runs'), {recursive: true}); mkdirSync(directory);
    report.environment.gitBefore = gitState(directory);
    readSources(report);
    input = JSON.parse(report.sources['inputs/完整教师初始化.json'].utf8);
    expectation = JSON.parse(report.sources['inputs/独立业务预期.json'].utf8);
    report.inputs = {initialization: input, expectation};
    const original = input.chapters.find(chapter => chapter.number === expectation.chapterNumber);
    A = plus(pairChapter(original), expectation.edits.before);
    report.independentExpectedA = A; persist('inputs');
    const [major, minor, patch] = process.versions.node.split('.').map(Number);
    if (major !== 24 || minor < 13 || (minor === 13 && patch < 1)) throw new Error(`需要 Node >=24.13.1 <25，实际 ${process.version}`);
    const channel = report.environment.deliveryBrowserChannel;
    if (channel !== null && (!channel.trim() || channel !== channel.trim())) throw new Error('DELIVERY_BROWSER_CHANNEL 必须是明确非空通道；没有自动回退。');
    const {Store} = await bounded(import('../dist/store.js'), 'Store import');
    const {prototypeServer} = await bounded(import('../dist/prototype-http.js'), 'HTTP import');
    seedModule = await bounded(import('./seed.mjs'), 'seed import');
    store = new Store(database); report.initialization = seedModule.seed(store);
    databaseState(store, seedModule.snapshot, input.work.id, report, 'seed'); persist('seed');
    const {chromium} = await bounded(import('@playwright/test'), 'Playwright import');
    report.environment.playwright = JSON.parse(readFileSync(resolve(project, 'node_modules/@playwright/test/package.json'), 'utf8')).version;
    report.environment.browserSelection = channel === null ? 'Playwright Chromium default' : channel;
    const launchOptions = {headless: true, timeout: LIMIT};
    if (channel !== null) launchOptions.channel = channel;
    browser = await chromium.launch(launchOptions);
    report.environment.browserVersion = browser.version();
    context = await bounded(browser.newContext({viewport: {width: 1280, height: 900}}), 'browser context');
    page = await bounded(context.newPage(), 'browser page');
    page.setDefaultTimeout(ACTION_LIMIT); page.setDefaultNavigationTimeout(LIMIT);
    instrumentPage(page, report, captures);
    server = prototypeServer(store, input.work.id); instrumentServer(server, report);
    await bounded(new Promise((resolveListen, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolveListen(); });
    }), 'HTTP listen');
    const base = `http://127.0.0.1:${server.address().port}`;
    report.environment.baseURL = base;
    const settled = () => page.waitForFunction(() => document.getElementById('chapters').children.length === 3 &&
      !!document.getElementById('draft-title').value && !document.getElementById('reload').disabled,
      undefined, {timeout: LIMIT});
    const selectSecond = async () => {
      await page.locator('#chapters button[data-number="2"]').click();
      await page.waitForFunction(() => document.getElementById('chapter-label').textContent.startsWith('第 2 章'), undefined, {timeout: LIMIT});
    };
    await step('initial', async () => { await page.goto(`${base}/?work=${encodeURIComponent(input.work.id)}`); await settled(); return pageState(page, report, 'initial'); });
    await step('selected', async () => { await selectSecond(); return pageState(page, report, 'selected'); });
    await step('before', () => attemptPair(page, report, 'before', expectation.edits.before));
    await step('comparison', async () => {
      await page.getByRole('button', {name: '重新读取', exact: true}).click();
      await page.waitForFunction(() => !document.getElementById('comparison').hidden &&
        !document.getElementById('reload').disabled && document.getElementById('message').textContent.includes('已读回'), undefined, {timeout: LIMIT});
      return pageState(page, report, 'comparison');
    });
    await step('gatesInstalled', async () => {
      await page.route(url => url.pathname === '/api/draft', trackedRoute(async route => {
        if (route.request().method() === 'POST' && !postUsed) {
          postUsed = true; postGate.arrive(route.request());
          await postGate.release.promise; saveReadArmed = true; postGate.entry.continuedAt = now();
        }
        await route.continue();
      }));
      await page.route(url => url.pathname === '/api/work', trackedRoute(async route => {
        if (route.request().method() === 'GET' && saveReadArmed && !getUsed) {
          getUsed = true; getGate.arrive(route.request());
          await getGate.release.promise; getGate.entry.continuedAt = now();
        }
        await route.continue();
      }));
      return {at: now(), after: '完整初读、选章、键盘输入及已有对照', responseMocking: false};
    });
    await step('postWait', async () => {
      await page.getByRole('button', {name: '保存草稿', exact: true}).click();
      await bounded(postGate.hit.promise, 'POST gate arrival');
      return {page: await pageState(page, report, 'POST gated'), servicePostCount: postRequests(report).length,
        database: databaseState(store, seedModule.snapshot, input.work.id, report, 'POST gated')};
    });
    await step('postKeyboard', () => attemptPair(page, report, 'post', expectation.edits.post));
    postGate.open('POST等待键盘观察完成');
    await step('getWait', async () => {
      await bounded(getGate.hit.promise, 'save-read GET gate arrival');
      return {page: await pageState(page, report, 'GET gated'), servicePostCount: postRequests(report).length,
        database: databaseState(store, seedModule.snapshot, input.work.id, report, 'GET gated')};
    });
    await step('getKeyboard', () => attemptPair(page, report, 'get', expectation.edits.get));
    getGate.open('GET等待键盘观察完成');
    await step('readback', async () => {
      await page.waitForFunction(() => !document.getElementById('reload').disabled &&
        document.getElementById('message').textContent.startsWith('已保存'), undefined, {timeout: LIMIT});
      return pageState(page, report, 'readback');
    });
    await step('afterKeyboard', () => attemptPair(page, report, 'after', expectation.edits.after));
    await step('refresh', async () => {
      await page.reload(); await settled(); await pageState(page, report, 'refresh before selecting chapter');
      await selectSecond(); return pageState(page, report, 'refresh second chapter');
    });
    await bounded(Promise.all([...captures]), 'complete response recording');
    finalDb = databaseState(store, seedModule.snapshot, input.work.id, report, 'observations complete');
    persist('observations complete; assertions pending');
  } catch (error) {
    const errors = report.activeStep ? report.observationErrors : report.environmentErrors;
    errors.push({step: report.activeStep ?? 'setup', error: errorRecord(error)});
  } finally {
    // 放行可能完成真实POST；不能称为撤销。最终库在清理后再次取证。
    postGate.open('finally release'); getGate.open('finally release');
    if (page) {
      await cleanup('route handlers settle', () => Promise.all([...routeTasks]));
      await cleanup('routes removed', () => page.unrouteAll({behavior: 'wait'}));
      await cleanup('response records drained', () => Promise.all([...captures]));
      await cleanup('page closed without saving local edits', () => page.close({runBeforeUnload: false}));
    }
    if (context) await cleanup('browser context closed', () => context.close());
    if (browser) await cleanup('browser closed', () => browser.close());
    if (server) await cleanup('HTTP closed', () => new Promise((resolveClose, reject) => {
      if (!server.listening) { server.closeAllConnections(); resolveClose(); return; }
      server.close(error => error ? reject(error) : resolveClose()); server.closeAllConnections();
    }));
    if (store) {
      await cleanup('final five tables and history captured', () => { finalDb = databaseState(store, seedModule.snapshot, input.work.id, report, 'after cleanup before Store close'); });
      await cleanup('Store closed', () => store.close());
    }
    await cleanup('response records final drain', () => Promise.all([...captures]));
    for (const [path, source] of Object.entries(report.sources)) {
      if (source.error) continue;
      try { const actual = sha256(readFileSync(resolve(project, path))); if (actual !== source.sha256) report.sourceChanges.push({path, before: source.sha256, after: actual}); }
      catch (error) { report.recordingErrors.push({kind: 'source reread', path, error: errorRecord(error)}); }
    }
    report.environment.gitAfter = gitState(directory);
    report.unfinished = planned.filter(step => !report.completed.includes(step));
    try { collectAssertions(report, observed, input, expectation, A, finalDb); }
    catch (error) { report.assertions.push({name: 'assertion collection completed', passed: false, error: errorRecord(error)}); }
    report.finishedAt = now();
    report.passed = report.assertions.length > 0 && report.assertions.every(item => item.passed) &&
      !report.unfinished.length && ['environmentErrors', 'observationErrors', 'recordingErrors', 'cleanupErrors', 'pageErrors', 'sourceChanges'].every(key => report[key].length === 0);
    if (!persist('final')) {
      report.passed = false;
      // 无落盘证据时把完整失败诊断输出到stderr，保留非零，不重试。
      process.stderr.write(JSON.stringify(report, null, 2) + '\n');
    }
    process.stdout.write(`delivery-saving: ${report.passed ? 'PASS' : 'FAIL'}；完整记录：${recordPath}\n`);
  }
  assert.equal(report.passed, true, `保存交付检查失败：${report.assertions.filter(item => !item.passed).map(item => item.name).join('; ')}；完整记录：${recordPath}`);
}

await test('正常保存交付：完整A、两门、键盘、真实读回、刷新和五表历史',
  {concurrency: false, timeout: TEST_LIMIT}, runDelivery);
