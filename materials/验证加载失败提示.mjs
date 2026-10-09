import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 使用真实浏览器网络失败，只核中文提示与原异常的显示边界。
const root = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(pathToFileURL(resolve(process.argv[2])).href);
const uuid = randomUUID(); const directory = resolve(root, '页面失败提示最终核', uuid);
await mkdir(directory, { recursive: true });
const git = (...args) => execFileSync('git', args, { cwd: resolve(root, 'lab'), encoding: 'utf8' }).trim();
const normal = JSON.parse(await readFile(resolve(root, '拟用完整材料/01-历史完整结束.json'), 'utf8'));
const result = { browserRunId: uuid, createdAt: new Date().toISOString(), git: git('rev-parse', 'HEAD'), gitWasClean: !git('status', '--porcelain'),
  viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, newModelCalls: 0, newBusinessSaves: 0,
  scope: '原713ea14c已通过部分不重做；本轮核无前次/有前次载入失败提示和完整原异常。', checks: [], captures: [], network: [], pageErrors: [] };
const assert = (ok, name, evidence) => { result.checks.push({ name, passed: Boolean(ok), evidence }); if (!ok) throw new Error(name); };
let browser;
try {
  assert(result.git === '601a3fbe5849875c8324d4b2d816ede7f97e20ff' && result.gitWasClean, '固定干净完成点', result.git);
  browser = await chromium.launch({ headless: true, channel: 'msedge' }); result.browserVersion = browser.version();
  const context = await browser.newContext({ viewport: result.viewport, deviceScaleFactor: 1 }); const page = await context.newPage();
  page.on('request', request => result.network.push({ url: request.url(), method: request.method() }));
  page.on('pageerror', error => result.pageErrors.push(error.message));
  const read = () => page.locator('#raw-playback').textContent().then(text => JSON.parse(text));
  const capture = async name => {
    const state = await page.evaluate(() => ({ status: document.querySelector('#status').textContent, width: innerWidth, height: innerHeight,
      direction: document.body.dataset.direction, nextFixture: document.querySelector('#fixture').value, nextLabel: document.querySelector('label[for=fixture]').firstChild.textContent,
      messageTexts: Array.from(document.querySelectorAll('#message .answer'), element => element.textContent),
      observation: JSON.parse(document.querySelector('#raw-playback').textContent) }));
    await writeFile(resolve(directory, `${name}.json`), `${JSON.stringify(state, null, 2)}\n`);
    await page.screenshot({ path: resolve(directory, `${name}.png`), fullPage: true });
    result.captures.push({ name, image: `${name}.png`, json: `${name}.json` }); return state;
  };
  await page.goto('http://127.0.0.1:4332/streaming.html', { waitUntil: 'networkidle' });
  await page.route('**/streaming-history/*.json', route => route.abort('internetdisconnected'));
  await page.click('#run');
  await page.waitForFunction(() => !document.querySelector('#run').disabled && document.querySelector('#status').textContent === '历史原件未能载入，请检查连接后重新回放。');
  const noPrevious = await read();
  assert(noPrevious.playbackState === 'failed' && noPrevious.error === 'Failed to fetch' && noPrevious.historicalRunId === null && noPrevious.actualEventsRead.length === 0, '无前次对象中文提示和原错误均成立', noPrevious);
  await capture('无前次对象-实际中文失败'); await page.unroute('**/streaming-history/*.json');
  await page.click('#run');
  await page.waitForFunction(() => !document.querySelector('#run').disabled && document.querySelector('#raw-playback').textContent && JSON.parse(document.querySelector('#raw-playback').textContent).playbackState === 'finished', undefined, { timeout: 20000 });
  const complete = await read();
  assert(complete.historicalRunId === normal.id && complete.actualEventsRead.length === 62 && isDeepStrictEqual(complete.finalSnapshot, normal.finalMessage), '恢复本机读取后完整原对象', complete.playbackId);
  await page.route('**/streaming-history/*.json', route => route.abort('internetdisconnected'));
  await page.click('#run');
  await page.waitForFunction(() => !document.querySelector('#run').disabled && document.querySelector('#status').textContent === '历史原件未能载入，上一份回放仍可查看。');
  assert(isDeepStrictEqual(await read(), complete), '有前次失败保留实际完整对象', complete.playbackId);
  await capture('有前次对象-实际中文失败');
  await page.locator('#records > summary').click(); await page.selectOption('#attempt', '2');
  const previousFailure = await read();
  assert(previousFailure.playbackState === 'failed' && previousFailure.error === 'Failed to fetch' && previousFailure.historicalRunId === null && previousFailure.actualEventsRead.length === 0, '第二份失败观察仍保留原错误', previousFailure);
  await writeFile(resolve(directory, '有前次对象-完整原错误观察.json'), `${JSON.stringify(previousFailure, null, 2)}\n`);
  assert(result.network.every(item => new URL(item.url).origin === 'http://127.0.0.1:4332' && item.method === 'GET' && !new URL(item.url).pathname.startsWith('/api/')), '只有本机GET', result.network.length);
  assert(result.pageErrors.length === 0, '无未捕获页面异常', result.pageErrors);
  result.completed = true; result.completedAt = new Date().toISOString();
  console.log(JSON.stringify({ browserRunId: uuid, git: result.git, checks: result.checks.length, directory }));
} catch (error) { result.completed = false; result.failure = { message: error.message, stack: error.stack }; process.exitCode = 1; console.log(JSON.stringify({ browserRunId: uuid, error: error.message })); }
finally { await writeFile(resolve(directory, '完整失败提示核对.json'), `${JSON.stringify(result, null, 2)}\n`); await browser?.close(); }
