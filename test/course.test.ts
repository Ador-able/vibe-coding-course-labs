import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCourseApp } from '../src/server.ts';
import { groups } from '../shared/catalog.ts';

test('同一服务打开全部实验与各章工作台，资源可读且共用设置不回传密钥', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'course-app-'));
  const course = await createCourseApp(join(directory, 'model.json'), join(directory, 'data'));
  const server = createServer(course.app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    for (const path of ['/', ...groups.flatMap(group => group.items.map(([path]) => path))]) {
      const response = await fetch(origin + path);
      assert.equal(response.status, 200, path);
      const html = await response.text(); assert.match(response.headers.get('content-type')!, /text\/html/, path);
      for (const match of html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g)) {
        const asset = await fetch(new URL(match[1], response.url)); assert.equal(asset.status, 200, `${path}: ${match[1]}`);
      }
    }
    const body = { baseUrl: 'https://example.test/v1', model: 'test-model', apiKey: 'course-test-secret' };
    const saved = await fetch(origin + '/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(saved.status, 200); assert(!(await saved.text()).includes(body.apiKey));
    const settings = await (await fetch(origin + '/api/config')).json();
    assert.equal(settings.hasKey, true); assert.equal(settings.model, body.model);
    assert.equal(JSON.parse(await readFile(join(directory, 'model.json'), 'utf8')).apiKey, body.apiKey);
    assert.equal((await fetch(origin + '/requests/records/凡人修仙传-quality.json')).status, 200);
    assert.equal((await fetch(origin + '/originals/fanren-C05.pdf')).headers.get('content-type'), 'application/pdf');
    assert.equal((await fetch(origin + '/missing-experiment')).status, 404);
    for (const path of ['/lessons/chapter03/课堂实录.html', '/lessons/chapter05/人的决定实录.html', '/lessons/materials/凡人修仙传/来源说明.md', '/theme.css']) assert.equal((await fetch(origin + path)).status, 200, path);
    assert.equal((await fetch(origin + '/api/lesson-runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chapter: '__proto__', action: 'anything' }) })).status, 400);
    // 从页面所用接口执行真正的本地观察，并独立读回本轮产生的业务结果。
    const started = await fetch(origin + '/api/lesson-runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chapter: 'chapter07', action: 'objects' }) });
    assert.equal(started.status, 202);
    let run = await started.json();
    const deadline = Date.now() + 15000;
    while (run.state === 'running' && Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 100)); run = await (await fetch(origin + `/api/lesson-runs/${run.id}`)).json(); }
    assert.equal(run.state, 'completed', run.log);
    const reportFile = run.files.find((file: { name: string }) => file.name.endsWith('/report.json')); assert.ok(reportFile);
    const report = await (await fetch(origin + reportFile.url)).json();
    assert.equal(report.passed, true); assert.equal(report.modelCalls, 0); assert.deepEqual(report.savedA, report.readA); assert.equal(report.readB, null);
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    course.close(); await rm(directory, { recursive: true, force: true });
  }
});
