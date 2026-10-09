import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 浏览器操作现有页面；测试记录与历史模型记录分别保存。
const root = dirname(fileURLToPath(import.meta.url));
const runtimePath = process.argv[2];
if (!runtimePath) throw new Error('请传入已有Playwright入口文件');
const { chromium } = await import(pathToFileURL(resolve(runtimePath)).href);
const uuid = randomUUID();
const directory = resolve(root, '页面实际记录', uuid);
await mkdir(directory, { recursive: true });
const git = (...args) => execFileSync('git', args, { cwd: resolve(root, 'lab'), encoding: 'utf8' }).trim();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const historical = [
  JSON.parse(await readFile(resolve(root, '拟用完整材料/01-历史完整结束.json'), 'utf8')),
  JSON.parse(await readFile(resolve(root, '拟用完整材料/02-历史中途停止.json'), 'utf8')),
];
const index = { browserRunId: uuid, createdAt: new Date().toISOString(), git: git('rev-parse', 'HEAD'),
  gitWasClean: !git('status', '--porcelain'), url: 'http://127.0.0.1:4332/streaming.html',
  scope: '新的零模型浏览器回放；原Node读取a8f5c50a与历史模型运行不重做、不改写。',
  viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1,
  newModelCalls: 0, newBusinessSaves: 0, checks: [], captures: [], network: [], pageErrors: [], consoleErrors: [],
};
let browser;
const assert = (condition, name, evidence) => {
  index.checks.push({ name, passed: Boolean(condition), evidence });
  if (!condition) throw new Error(`页面核对未通过：${name}`);
};
const saveIndex = async () => writeFile(resolve(directory, '完整页面运行索引.json'), `${JSON.stringify(index, null, 2)}\n`);
try {
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  index.browserVersion = browser.version();
  const context = await browser.newContext({ viewport: index.viewport, deviceScaleFactor: 1, acceptDownloads: true });
  const pages = [];
  for (const direction of ['original', 'studio', 'notebook']) {
    const page = await context.newPage(); pages.push(page);
    page.on('request', request => index.network.push({ direction, url: request.url(), method: request.method() }));
    page.on('pageerror', error => index.pageErrors.push({ direction, message: error.message }));
    page.on('console', message => { if (message.type() === 'error') index.consoleErrors.push({ direction, text: message.text() }); });
    const readObservation = async () => JSON.parse(await page.locator('#raw-playback').textContent());
    const capture = async label => {
      const state = await page.evaluate(() => ({
        capturedAt: new Date().toISOString(), direction: document.body.dataset.direction,
        width: innerWidth, height: innerHeight, devicePixelRatio, visualViewportScale: visualViewport?.scale ?? null,
        documentScrollWidth: document.documentElement.scrollWidth,
        material: document.querySelector('#material').value,
        readonly: document.querySelector('#material').readOnly,
        status: document.querySelector('#status').textContent,
        progress: document.querySelector('#progress').textContent,
        messageTexts: Array.from(document.querySelectorAll('#message .answer'), element => element.textContent),
        buttons: Array.from(document.querySelectorAll('button'), element => ({ id: element.id, text: element.textContent, disabled: element.disabled, hidden: element.hidden })),
        selects: Array.from(document.querySelectorAll('select'), element => ({ id: element.id, value: element.value, disabled: element.disabled, options: Array.from(element.options, option => ({ value: option.value, text: option.textContent })) })),
        details: Array.from(document.querySelectorAll('details'), element => ({ open: element.open, title: element.querySelector('summary')?.textContent })),
        observation: document.querySelector('#raw-playback').textContent ? JSON.parse(document.querySelector('#raw-playback').textContent) : null,
        originalRecordText: document.querySelector('#raw-record').textContent,
      }));
      await writeFile(resolve(directory, `${label}.json`), `${JSON.stringify(state, null, 2)}\n`);
      await page.screenshot({ path: resolve(directory, `${label}.png`), fullPage: true });
      index.captures.push({ label, direction: state.direction, json: `${label}.json`, image: `${label}.png`, capturedAt: state.capturedAt });
      return state;
    };
    const waitFinished = () => page.waitForFunction(() => !document.querySelector('#run').disabled && document.querySelector('#raw-playback').textContent && JSON.parse(document.querySelector('#raw-playback').textContent).endedAt, undefined, { timeout: 20000 });
    const verifyComplete = async (fixtureIndex, label) => {
      const observation = await readObservation();
      const source = historical[fixtureIndex];
      assert(observation.playbackState === 'finished', `${label}消费者读取结束`, observation.playbackState);
      assert(observation.historicalRunId === source.id && observation.historicalStartMessageId === source.id && observation.returnedMessageId === source.id && observation.playbackId !== source.id, `${label}三处历史身份与本次回放区分`, {
        playback: observation.playbackId, historical: observation.historicalRunId, start: observation.historicalStartMessageId, message: observation.returnedMessageId,
      });
      assert(isDeepStrictEqual(observation.actualEventsRead.map(entry => entry.event), source.uiEvents.map(entry => entry.event)), `${label}全部原事件与ID`, observation.actualEventsRead.length);
      assert(isDeepStrictEqual(observation.actualEventsRead.map(entry => entry.historicalElapsedMs), source.uiEvents.map(entry => entry.elapsedMs)), `${label}原历史时间`, true);
      assert(isDeepStrictEqual(observation.finalSnapshot, source.finalMessage), `${label}导出JSON最后消息值`, { snapshots: observation.snapshots.length });
      const texts = await page.locator('#message .answer').allTextContents();
      assert(isDeepStrictEqual(texts, source.stages.map(stage => stage.answer)), `${label}页面完整正文`, texts);
      assert(observation.snapshots.every(snapshot => snapshot.parts.filter(part => part.type === 'data-progress').length <= 1), `${label}只有一个进度位置`, true);
      return observation;
    };
    await page.goto(index.url, { waitUntil: 'networkidle' });
    await page.selectOption('#direction', direction);
    const initial = await capture(`${direction}-初始整页`);
    assert(initial.material === historical[0].material && initial.material.length === 196 && initial.readonly, `${direction}完整固定纪要`, initial.material.length);
    await page.click('#run');
    await page.waitForFunction(() => {
      const text = document.querySelector('#raw-playback').textContent;
      if (!text) return false;
      const parts = JSON.parse(text).finalSnapshot?.parts.filter(part => part.type === 'text') ?? [];
      return parts.length === 2 && parts[0].state === 'done' && parts[1].state === 'streaming' && parts[1].text.length > 0;
    });
    await capture(`${direction}-摘要结束问题仍在接收`);
    await waitFinished();
    const firstComplete = await verifyComplete(0, `${direction}完整轮`);
    await capture(`${direction}-完整结束整页`);

    await page.click('#run'); await waitFinished();
    const secondComplete = await verifyComplete(0, `${direction}再次回放`);
    assert(secondComplete.playbackId !== firstComplete.playbackId, `${direction}再次读取有新身份`, [firstComplete.playbackId, secondComplete.playbackId]);
    await page.selectOption('#fixture', '1'); await page.click('#run'); await waitFinished();
    const stopped = await verifyComplete(1, `${direction}历史停止轮`);
    assert(stopped.finalSnapshot.parts.filter(part => part.type === 'text')[1].state === 'streaming' && stopped.finalSnapshot.metadata.stages[1].usage === null,
      `${direction}停止半句与未知保留`, stopped.finalSnapshot.parts.filter(part => part.type === 'text')[1]);
    await capture(`${direction}-历史停止整页`);
    await page.locator('#records > summary').click(); await page.selectOption('#event-view', 'all');
    await page.locator('#records details > summary').filter({ hasText: '历史原始数据' }).click();
    await capture(`${direction}-停止全部事件与长原记录`);

    const sourceDownloadPromise = page.waitForEvent('download'); await page.click('#download-source');
    const sourceDownload = await sourceDownloadPromise;
    const sourceFile = `${direction}-下载历史原件.json`; await sourceDownload.saveAs(resolve(directory, sourceFile));
    const sourceBytes = await readFile(resolve(directory, sourceFile));
    assert(hash(sourceBytes) === '4f54884f3dddde0041ac586304ebc70342593fdd2bdd3f9b042166b0f816a17b', `${direction}实际浏览器下载原字节`, { bytes: sourceBytes.length, sha256: hash(sourceBytes) });
    const observationDownloadPromise = page.waitForEvent('download'); await page.click('#download-observation');
    const observationDownload = await observationDownloadPromise;
    const observationFile = `${direction}-下载本次观察.json`; await observationDownload.saveAs(resolve(directory, observationFile));
    assert(isDeepStrictEqual(JSON.parse(await readFile(resolve(directory, observationFile), 'utf8')), await readObservation()), `${direction}浏览器下载完整观察`, observationFile);

    await page.selectOption('#fixture', '0'); await page.click('#run');
    await page.waitForFunction(() => {
      const text = document.querySelector('#raw-playback').textContent;
      if (!text) return false;
      const observed = JSON.parse(text);
      return observed.playbackState === 'reading' && observed.historicalRunId === '1153e17e-e0b4-4870-978f-bf0eca94b0fb' && observed.actualEventsRead.length >= 10;
    });
    await page.click('#stop'); await waitFinished();
    const cancelled = await readObservation();
    await page.waitForTimeout(1500);
    assert(isDeepStrictEqual(await readObservation(), cancelled), `${direction}停止后没有晚到更新`, { events: cancelled.actualEventsRead.length });
    assert(cancelled.playbackState === 'interrupted' && cancelled.historicalState === 'completed' && cancelled.actualEventsRead.length < 62 && !cancelled.actualEventsRead.some(entry => entry.event.type === 'abort'),
      `${direction}本地中止不改历史状态或补事件`, { state: cancelled.playbackState, historicalState: cancelled.historicalState, events: cancelled.actualEventsRead.length });
    await capture(`${direction}-本次中止历史仍完整`);

    const beforeFailure = await readObservation();
    await page.route('**/streaming-history/*.json', route => route.abort('internetdisconnected'));
    await page.click('#run');
    await page.waitForFunction(() => !document.querySelector('#run').disabled && document.querySelector('#status').textContent.includes('上一份回放仍可查看'));
    assert(isDeepStrictEqual(await readObservation(), beforeFailure), `${direction}原件加载失败保留上次对象`, beforeFailure.playbackId);
    await capture(`${direction}-受控加载失败保留旧对象`);
    await page.unroute('**/streaming-history/*.json');
    const failedChoice = String(await page.locator('#attempt option').count() - 1);
    await page.selectOption('#attempt', failedChoice);
    const failed = await readObservation();
    assert(failed.playbackState === 'failed' && failed.historicalRunId === null && failed.actualEventsRead.length === 0, `${direction}真实载入失败独立记录`, failed);
    await writeFile(resolve(directory, `${direction}-载入失败完整观察.json`), `${JSON.stringify(failed, null, 2)}\n`);

    // 同一个已存对象切换方向，只改变呈现，不重新读取。
    if (direction === 'original') {
      for (const [fixtureName, attemptIndex] of [['完整', '1'], ['停止', '2']]) {
        if (!(await page.locator('#records').getAttribute('open') !== null)) await page.locator('#records > summary').click();
        await page.selectOption('#attempt', attemptIndex);
        if (await page.locator('#records').getAttribute('open') !== null) await page.locator('#records > summary').click();
        const shared = await readObservation();
        for (const theme of ['original', 'studio', 'notebook']) {
          await page.selectOption('#direction', theme);
          await capture(`同对象-${fixtureName}-${theme}-整页`);
          assert(isDeepStrictEqual(await readObservation(), shared), `同对象${fixtureName}${theme}方向切换没有重消费`, shared.playbackId);
          await page.setViewportSize({ width: 390, height: 844 });
          const narrow = await capture(`同对象-${fixtureName}-${theme}-窄屏`);
          assert(narrow.documentScrollWidth <= 390 && isDeepStrictEqual(narrow.observation, shared), `同对象${fixtureName}${theme}窄屏数据与页面宽度`, narrow.documentScrollWidth);
          await page.setViewportSize(index.viewport);
        }
      }
      await page.selectOption('#direction', 'original');
    }
    console.log(JSON.stringify({ browserRunId: uuid, direction, checks: index.checks.length, captures: index.captures.length }));
    await saveIndex();
  }
  assert(index.network.every(request => new URL(request.url).origin === 'http://127.0.0.1:4332' && request.method === 'GET' && !new URL(request.url).pathname.startsWith('/api/')), '网络只有本机GET，没有模型或业务请求', index.network.length);
  assert(index.pageErrors.length === 0, '无未捕获页面异常', index.pageErrors);
  index.completedAt = new Date().toISOString(); index.completed = true;
} catch (error) {
  index.completed = false;
  index.failure = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
  console.log(JSON.stringify({ browserRunId: uuid, failure: index.failure.message }));
  process.exitCode = 1;
} finally {
  await saveIndex();
  await browser?.close();
}
