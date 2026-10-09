import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { createServer as createViteServer } from 'vite';
import { consumeStream, pipeUIMessageStreamToResponse } from 'ai';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { loadCatalog } from './fixtures.ts';
import { requestStream } from './model.ts';
import { observed, SCENARIOS, terminal } from './contract.ts';
import type { RequestRecord, Timed } from './contract.ts';

const { values } = parseArgs({ options: {
  'evidence-dir': { type: 'string' }, port: { type: 'string', default: '4340' },
  help: { type: 'boolean', default: false },
} });
if (values.help) {
  console.log('受控请求观察：pnpm requests:dev --evidence-dir <本轮记录目录> [--port 4340]。不调用云模型，不写章稿库。');
  process.exit(0);
}
if (!values['evidence-dir']) throw new Error('请指定自己的 --evidence-dir，保留本轮完整记录。');
const port = z.coerce.number().int().min(1).max(65535).parse(values.port);
const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: projectRoot, encoding: 'utf8' }).trim();
const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();
if (execFileSync('git', ['status', '--porcelain'], { cwd: projectRoot, encoding: 'utf8' }).trim()) throw new Error('请先固定这个练习项目的代码与完整材料。');
const directory = resolve(values['evidence-dir']);
const serviceId = randomUUID();
const catalog = await loadCatalog();
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, `service-${serviceId}.json`), JSON.stringify({
  serviceId, pid: process.pid, startedAt: new Date().toISOString(), projectRoot, gitHead,
  port, sdkVersion: catalog.sdkVersion, fixtureFiles: catalog.files,
  cloudModelRequests: 0, businessDatabaseWrites: 0,
  origin: '官方Mock提供方的受控SDK执行，原件1153及其usage不是本轮输出',
}, null, 2));
const httpLog = resolve(directory, `http-${serviceId}.jsonl`);
const runs = new Map<string, { record: RequestRecord; controller: AbortController }>();
const app = express();
app.use(express.json());

// 每条API保留真实请求和HTTP终止状态；SSE产生值另在该请求记录。
app.use('/api/requests', (req, res, next) => {
  const beganAt = new Date().toISOString();
  const httpObservationId = randomUUID();
  let returnedJson: unknown = null, recorded = false;
  const json = res.json.bind(res);
  res.json = (body => { returnedJson = structuredClone(body); return json(body); }) as typeof res.json;
  const save = () => {
    if (recorded) return; recorded = true;
    appendFileSync(httpLog, JSON.stringify({ httpObservationId, serviceId, beganAt, observedAt: new Date().toISOString(),
      method: req.method, url: req.originalUrl, input: req.body ?? null,
      status: res.headersSent ? res.statusCode : null, nodeHeaders: res.getHeaders(),
      writableEnded: res.writableEnded, destroyed: res.destroyed, returnedJson,
    }) + '\n');
  };
  res.once('finish', save); res.once('close', save); next();
});

app.get('/api/requests/catalog', (_req, res) => res.json({ ...catalog, serviceId, gitHead }));
app.get('/api/requests/:id', (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const run = runs.get(id);
  if (!run) { res.status(404).json({ code: 'REQUEST_NOT_FOUND', message: '这个服务进程没有本次记录；不能据此恢复原调用。' }); return; }
  res.json(run.record);
});
app.post('/api/requests/:id/cancel', (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const run = runs.get(id);
  if (!run) { res.status(404).json({ code: 'REQUEST_NOT_FOUND', message: '没有找到本次记录，停止是否送达尚未确认。' }); return; }
  const requestedAt = new Date().toISOString();
  if (!terminal(run.record.state) && !run.controller.signal.aborted) {
    run.record.manualStopRequestedAt = requestedAt;
    run.record.transport.push({ at: requestedAt, elapsedMs: Date.now() - Date.parse(run.record.startedAt), value: { kind: 'manual-cancel-received' } });
    run.controller.abort(new DOMException('用户要求停止本次请求', 'AbortError'));
    writeFileSync(resolve(directory, `request-${id}.json`), JSON.stringify(run.record, null, 2));
  }
  res.json({ requestId: id, requestedAt, stateAtReply: run.record.state,
    acceptedForCancellation: run.record.manualStopRequestedAt !== null,
    message: '这是停止请求的反馈；请按本次编号核查实际终态。' });
});

const inputSchema = z.object({
  id: z.string().uuid(), fixtureKey: z.enum(['A', 'B']),
  scenario: z.enum(SCENARIOS.map(item => item.key) as [typeof SCENARIOS[number]['key'], ...Array<typeof SCENARIOS[number]['key']>]),
  messages: z.array(z.object({ id: z.string().min(1), role: z.literal('user'),
    parts: z.tuple([z.object({ type: z.literal('text'), text: z.string().min(1).max(6000) })]) })).length(1),
});
app.post('/api/requests', async (req, res) => {
  const input = inputSchema.parse(req.body);
  const fixture = catalog.fixtures[input.fixtureKey];
  const prompt = input.messages[0]!.parts[0].text;
  if (prompt !== fixture.input) {
    res.status(400).json({ code: 'FIXED_MATERIAL_REQUIRED', message: '本页只演练两份固定纪要。请先载入所选全文；当前输入仍保留。' }); return;
  }
  if (runs.has(input.id)) {
    res.status(409).json({ code: 'REQUEST_EXISTS', message: '这个编号已有请求，请先核查原编号，不自动叠加。' }); return;
  }
  const start = performance.now();
  const stamp = <T>(value: T): Timed<T> => ({ at: new Date().toISOString(), elapsedMs: Math.round((performance.now() - start) * 10) / 10, value });
  const record: RequestRecord = {
    requestId: input.id, serviceId, fixtureKey: input.fixtureKey, scenario: input.scenario,
    input: prompt, instructions: fixture.instructions, answerOrigin: fixture.answerOrigin, source: fixture.source,
    sdkOptions: { maxRetries: 1, streamRetries: 'omitted', totalTimeoutMs: input.scenario === 'timeout' ? 1200 : 15000 },
    startedAt: new Date().toISOString(), state: 'running', cause: null, finishedAt: null,
    manualStopRequestedAt: null, connectionClosedAt: null, providerCalls: [], sdkParts: [],
    callbacks: [], uiEvents: [], transport: [], serverSseProduced: [], uiMessage: null, uiOutcome: null, error: null,
  };
  const controller = new AbortController();
  runs.set(input.id, { record, controller });
  const persist = () => writeFileSync(resolve(directory, `request-${input.id}.json`), JSON.stringify(record, null, 2));
  persist();
  let dropTimer: NodeJS.Timeout | undefined;
  const close = () => {
    record.transport.push(stamp({ kind: 'response-close', writableEnded: res.writableEnded, state: record.state }));
    if (!res.writableEnded && record.state === 'running') {
      record.connectionClosedAt = new Date().toISOString();
      if (!controller.signal.aborted) controller.abort(new DOMException('本次HTTP连接提前关闭', 'AbortError'));
    }
    persist();
  };
  res.once('close', close);
  res.on('error', error => { record.transport.push(stamp({ kind: 'response-error', error: observed(error) })); persist(); });
  const afterThirdDelta = () => {
    if (record.scenario !== 'disconnect') return;
    record.transport.push(stamp({ kind: 'exercise-disconnect-scheduled', delayMs: 250 })); persist();
    dropTimer = setTimeout(() => {
      record.transport.push(stamp({ kind: 'exercise-destroy-http-response', writableEnded: res.writableEnded, state: record.state })); persist();
      res.destroy(new Error('教学控制：中断本机HTTP响应连接'));
    }, 250);
  };
  try {
    const stream = requestStream(record, fixture, controller, stamp, persist, afterThirdDelta).pipeThrough(new TransformStream({
      transform(event, destination) { record.uiEvents.push(stamp(structuredClone(event))); persist(); destination.enqueue(event); },
    }));
    await pipeUIMessageStreamToResponse({ response: res, stream,
      consumeSseStream: ({ stream: copy }) => {
        // 只消费同一流的副本完成观察；连接close仍会中止当前SDK调用。
        void consumeStream({ stream: copy.pipeThrough(new TransformStream({
          transform(value, destination) { record.serverSseProduced.push(stamp(value)); persist(); destination.enqueue(value); },
        })), onError: error => { record.transport.push(stamp({ kind: 'sse-copy-error', error: observed(error) })); persist(); } });
      },
    });
  } catch (error) {
    record.transport.push(stamp({ kind: 'http-write-error', error: observed(error) })); persist();
    if (!res.headersSent && !res.destroyed) res.status(500).json({ code: 'REQUEST_PROCESSING_FAILED', message: '请求未得到完整反馈，请核查本次编号。' });
  } finally {
    if (dropTimer) clearTimeout(dropTimer);
    if (!res.writableEnded && record.state === 'running' && !controller.signal.aborted) {
      record.connectionClosedAt ??= new Date().toISOString();
      controller.abort(new DOMException('本次响应消费未能完成', 'AbortError'));
    }
    persist();
  }
});
const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
  const invalid = error instanceof z.ZodError;
  res.status(invalid ? 400 : 500).json({ code: invalid ? 'INPUT_INVALID' : 'SERVER_ERROR',
    message: invalid ? '输入格式不正确，请保留草稿并检查完整材料。' : '服务未能处理这次操作，请保留输入并核查本次编号。' });
};
app.use(handleError);
const vite = await createViteServer({ configFile: resolve(projectRoot, 'vite.requests.config.ts'), server: { middlewareMode: true }, appType: 'mpa' });
app.use(vite.middlewares);
const server = app.listen(port, '127.0.0.1', () => console.log(`受控请求观察：http://127.0.0.1:${port}/requests.html\n完整记录：${directory}\n固定代码：${gitHead}`));
server.on('error', async error => { console.error(error.message); await vite.close(); process.exitCode = 1; });
process.once('SIGINT', () => { server.closeAllConnections(); server.close(() => { void vite.close().then(() => process.exit(0)); }); });
