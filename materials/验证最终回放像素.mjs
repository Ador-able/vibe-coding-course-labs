import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 只核本页三处呈现变动；完整业务证据仍使用原9014运行。
const root = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(pathToFileURL(resolve(process.argv[2])).href);
const uuid = randomUUID();
const directory = resolve(root, '页面最终像素', uuid);
await mkdir(directory, { recursive: true });
const git = (...args) => execFileSync('git', args, { cwd: resolve(root, 'lab'), encoding: 'utf8' }).trim();
const normal = JSON.parse(await readFile(resolve(root, '拟用完整材料/01-历史完整结束.json'), 'utf8'));
const stopped = JSON.parse(await readFile(resolve(root, '拟用完整材料/02-历史中途停止.json'), 'utf8'));
const index = { browserRunId: uuid, createdAt: new Date().toISOString(), git: git('rev-parse', 'HEAD'), gitWasClean: !git('status', '--porcelain'),
  url: 'http://127.0.0.1:4332/streaming.html', viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1,
  scope: '底色、下次回放标签、加载失败中文提示的最小实际核查；不重复原104项条件，不调用模型或业务服务。',
  newModelCalls: 0, newBusinessSaves: 0, checks: [], captures: [], network: [], pageErrors: [], consoleErrors: [] };
const assert = (condition, name, evidence) => {
  index.checks.push({ name, passed: Boolean(condition), evidence });
  if (!condition) throw new Error(`最小核查未通过：${name}`);
};
const save = () => writeFile(resolve(directory, '完整最小核查索引.json'), `${JSON.stringify(index, null, 2)}\n`);
let browser;
try {
  assert(index.git === 'add1adab052527a76c7ee6200c1c3cb1bc0477df' && index.gitWasClean, '固定且干净的最终应用点', index.git);
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  index.browserVersion = browser.version();
  const context = await browser.newContext({ viewport: index.viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const attach = (target, label) => {
    target.on('request', request => index.network.push({ page: label, url: request.url(), method: request.method() }));
    target.on('pageerror', error => index.pageErrors.push({ page: label, message: error.message }));
    target.on('console', message => { if (message.type() === 'error') index.consoleErrors.push({ page: label, text: message.text() }); });
  };
  attach(page, '共同对象');
  const observation = target => target.locator('#raw-playback').textContent().then(text => text ? JSON.parse(text) : null);
  const capture = async (target, label) => {
    await target.evaluate(() => scrollTo(0, 0));
    const state = await target.evaluate(() => {
      const body = document.body.getBoundingClientRect();
      const elements = ['body', ':root', '#app', '#source', '#assistant'].map(selector => {
        const element = document.querySelector(selector); const css = getComputedStyle(element); const rect = element.getBoundingClientRect();
        return { selector, background: css.backgroundColor, minHeight: css.minHeight, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      });
      return { capturedAt: new Date().toISOString(), direction: document.body.dataset.direction, width: innerWidth, height: innerHeight,
        devicePixelRatio, visualViewportScale: visualViewport?.scale ?? null, documentScrollWidth: document.documentElement.scrollWidth,
        bodyTop: body.top, bodyBottom: body.bottom, elements, material: document.querySelector('#material').value,
        nextFixture: document.querySelector('#fixture').value, nextLabel: document.querySelector('label[for=fixture]').firstChild.textContent,
        status: document.querySelector('#status').textContent, progress: document.querySelector('#progress').textContent,
        messageTexts: Array.from(document.querySelectorAll('#message .answer'), element => element.textContent),
        observation: document.querySelector('#raw-playback').textContent ? JSON.parse(document.querySelector('#raw-playback').textContent) : null };
    });
    await writeFile(resolve(directory, `${label}.json`), `${JSON.stringify(state, null, 2)}\n`);
    await target.screenshot({ path: resolve(directory, `${label}.png`), fullPage: true });
    index.captures.push({ label, json: `${label}.json`, image: `${label}.png`, width: state.width, height: state.height, direction: state.direction });
    return state;
  };
  const directions = async (label, shared) => {
    for (const direction of ['original', 'studio', 'notebook']) {
      await page.selectOption('#direction', direction);
      for (const [size, viewport] of [['整页', index.viewport], ['窄屏', { width: 390, height: 844 }]]) {
        await page.setViewportSize(viewport);
        const state = await capture(page, `${label}-${direction}-${size}`);
        assert(state.bodyBottom >= state.height && state.documentScrollWidth <= state.width, `${label}${direction}${size}覆盖视口且不溢出`, { bodyBottom: state.bodyBottom, viewport: state.height, scrollWidth: state.documentScrollWidth });
        assert(isDeepStrictEqual(state.observation, shared), `${label}${direction}${size}切换保持同对象`, shared?.playbackId ?? null);
        assert(state.nextLabel === '下次回放', `${label}${direction}${size}标签明确`, state.nextLabel);
      }
    }
    await page.setViewportSize(index.viewport);
    await page.selectOption('#direction', 'original');
  };
  const finish = () => page.waitForFunction(() => !document.querySelector('#run').disabled && document.querySelector('#raw-playback').textContent && JSON.parse(document.querySelector('#raw-playback').textContent).endedAt, undefined, { timeout: 20000 });
  await page.goto(index.url, { waitUntil: 'networkidle' });
  await directions('初始短页', null);
  await page.click('#run'); await finish();
  const complete = await observation(page);
  assert(complete.historicalRunId === normal.id && complete.actualEventsRead.length === 62 && isDeepStrictEqual(complete.finalSnapshot, normal.finalMessage), '完整对象与历史原件相同', { events: complete.actualEventsRead.length, playback: complete.playbackId });
  await directions('完整同对象', complete);

  await page.selectOption('#fixture', '1'); await page.click('#run'); await finish();
  const oldStopped = await observation(page);
  await page.selectOption('#fixture', '0');
  assert(oldStopped.historicalRunId === stopped.id && oldStopped.actualEventsRead.length === 52 && isDeepStrictEqual(oldStopped.finalSnapshot, stopped.finalMessage), '当前停止对象原样保留', oldStopped.playbackId);
  for (const direction of ['original', 'studio', 'notebook']) {
    await page.selectOption('#direction', direction);
    const state = await capture(page, `停止观察与下次完整-${direction}`);
    assert(state.nextFixture === '0' && state.nextLabel === '下次回放' && isDeepStrictEqual(state.observation, oldStopped), `${direction}当前停止与下次完整互不覆盖`, { next: state.nextFixture, current: state.observation.historicalRunId });
  }
  await page.selectOption('#direction', 'original');
  await page.click('#run'); await finish();
  const next = await observation(page);
  assert(next.historicalRunId === normal.id && next.playbackId !== complete.playbackId && next.playbackId !== oldStopped.playbackId && next.actualEventsRead.length === 62 && isDeepStrictEqual(next.finalSnapshot, normal.finalMessage), '按钮实际执行下次完整记录', next.playbackId);
  await capture(page, '按下次完整按钮后的实际结果');

  await page.route('**/streaming-history/*.json', route => route.abort('internetdisconnected'));
  await page.click('#run');
  await page.waitForFunction(() => !document.querySelector('#run').disabled && document.querySelector('#status').textContent === '历史原件未能载入，上一份回放仍可查看。');
  assert(isDeepStrictEqual(await observation(page), next), '受控载入失败仍显示前次完整对象', next.playbackId);
  await capture(page, '有前次对象-中文加载失败');
  await page.locator('#records > summary').click();
  await page.selectOption('#attempt', String(await page.locator('#attempt option').count() - 1));
  const failure = await observation(page);
  assert(failure.playbackState === 'failed' && failure.error === 'Failed to fetch' && failure.actualEventsRead.length === 0 && failure.historicalRunId === null, '完整失败观察保留原异常', failure);
  await writeFile(resolve(directory, '有前次对象-完整原异常观察.json'), `${JSON.stringify(failure, null, 2)}\n`);
  await page.unroute('**/streaming-history/*.json');

  const empty = await context.newPage(); attach(empty, '无前次对象');
  await empty.goto(index.url, { waitUntil: 'networkidle' });
  await empty.route('**/streaming-history/*.json', route => route.abort('internetdisconnected'));
  await empty.click('#run');
  await empty.waitForFunction(() => !document.querySelector('#run').disabled && document.querySelector('#status').textContent === '历史原件未能载入，请检查连接后重新回放。');
  const emptyFailure = await observation(empty);
  assert(emptyFailure.playbackState === 'failed' && emptyFailure.error === 'Failed to fetch' && emptyFailure.actualEventsRead.length === 0 && emptyFailure.historicalRunId === null, '无前次对象中文提示及原异常', emptyFailure);
  await capture(empty, '无前次对象-中文加载失败');
  assert(index.network.every(item => new URL(item.url).origin === 'http://127.0.0.1:4332' && item.method === 'GET' && !new URL(item.url).pathname.startsWith('/api/')), '只有本机静态读取没有模型与业务请求', index.network.length);
  assert(index.pageErrors.length === 0, '无未捕获页面异常', index.pageErrors);
  index.completed = true; index.completedAt = new Date().toISOString();
  console.log(JSON.stringify({ browserRunId: uuid, git: index.git, checks: index.checks.length, captures: index.captures.length, directory }));
} catch (error) {
  index.completed = false; index.failure = { message: error.message, stack: error.stack };
  console.log(JSON.stringify({ browserRunId: uuid, failure: error.message })); process.exitCode = 1;
} finally { await save(); await browser?.close(); }
