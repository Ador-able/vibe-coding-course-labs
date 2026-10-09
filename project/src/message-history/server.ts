import express from 'express';
import type { ErrorRequestHandler, Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { conversationIdSchema, fixtureKeySchema, phaseSchema, validateMessages } from './contract.ts';
import type { ConversationView } from './contract.ts';
import { historyImport, loadFixtures } from './fixtures.ts';
import { MessageStore } from './store.ts';
import { prepareInput } from './projection.ts';

const { values } = parseArgs({ options: {
  db: { type: 'string' }, 'evidence-dir': { type: 'string' },
  port: { type: 'string', default: '4335' }, help: { type: 'boolean', default: false },
} });
if (values.help) {
  console.log('消息保存练习：pnpm messages:dev --db <SQLite文件> --evidence-dir <完整HTTP记录目录> [--port 4335]');
  process.exit(0);
}
if (!values.db || !values['evidence-dir']) throw new Error('必须明确指定自己的 --db 和 --evidence-dir。');
const port = z.coerce.number().int().min(1).max(65535).parse(values.port);
const labRoot = fileURLToPath(new URL('../../', import.meta.url));
const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: labRoot, encoding: 'utf8' }).trim();
const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: labRoot, encoding: 'utf8' }).trim();
const gitChanges = execFileSync('git', ['status', '--porcelain'], { cwd: labRoot, encoding: 'utf8' });
if (gitChanges.trim()) throw new Error('当前代码未固定，请先提交这个独立练习目录的改动。');
const dbPath = resolve(values.db);
const evidenceDirectory = resolve(values['evidence-dir']);
const serviceId = randomUUID();
const fixtures = await loadFixtures();
mkdirSync(dirname(dbPath), { recursive: true });
mkdirSync(evidenceDirectory, { recursive: true });
const store = new MessageStore(dbPath);
const logPath = resolve(evidenceDirectory, `http-${serviceId}.jsonl`);
writeFileSync(resolve(evidenceDirectory, `service-${serviceId}.json`), JSON.stringify({
  serviceId, processId: process.pid, startedAt: new Date().toISOString(),
  gitHead, gitRoot, dbPath, port, sdkVersion: '7.0.122', modelCalls: 0, files: fixtures.catalog.files,
}, null, 2), 'utf8');
const app = express();

// API 留完整输入与返回；静态文件请求不混入业务记录。
app.use('/api/messages', (req, res, next) => {
  const requestId = randomUUID();
  const startedAt = new Date().toISOString();
  const json = res.json.bind(res);
  res.json = ((body: unknown) => {
    appendFileSync(logPath, JSON.stringify({
      requestId, serviceId, startedAt, finishedAt: new Date().toISOString(),
      method: req.method, url: req.originalUrl, requestBody: req.body ?? null,
      status: res.statusCode, responseBody: body,
    }) + '\n', 'utf8');
    return json(body);
  }) as Response['json'];
  next();
});
app.use(express.json());

app.get('/api/messages/catalog', (_req, res) => res.json(fixtures.catalog));
app.get('/api/messages/conversations', (_req, res) => res.json(store.list()));

function readView(req: Request, res: Response): ConversationView | undefined {
  const id = conversationIdSchema.parse(req.params.id);
  const view = store.read(id);
  if (!view) res.status(404).json({ code: 'CONVERSATION_NOT_FOUND', message: '没有找到这份已保存记录。' });
  return view;
}

app.post('/api/messages/conversations', (req, res) => {
  const body = z.object({ fixtureKey: fixtureKeySchema }).parse(req.body);
  const fixture = fixtures.byKey.get(body.fixtureKey)!;
  const id = store.create(fixture.sourceRecordId, fixture.userMessage);
  res.status(201).json({ action: 'save-user', saved: true, view: store.read(id) });
});

app.get('/api/messages/conversations/:id', (req, res) => {
  const view = readView(req, res);
  if (view) res.json(view);
});

app.post('/api/messages/conversations/:id/import', (req, res) => {
  const view = readView(req, res);
  if (!view) return;
  const { phase } = z.object({ phase: phaseSchema }).parse(req.body);
  const fixture = fixtures.bySourceId.get(view.conversation.sourceRecordId)!;
  if (!fixture.phases.includes(phase)) {
    res.status(400).json({ code: 'PHASE_UNAVAILABLE', message: '这份历史原件没有所选快照。' });
    return;
  }
  const { message, state } = historyImport(fixture, phase);
  store.saveAssistant(view.conversation.id, message, state);
  res.json({ action: 'save-history', phase, saved: true, view: store.read(view.conversation.id) });
});

app.post('/api/messages/conversations/:id/feedback', async (req, res) => {
  const view = readView(req, res);
  if (!view) return;
  const note = z.object({ note: z.string().refine(text => text.trim().length > 0, '校正不能为空。') })
    .parse(req.body).note;
  if (!view.messages.some(message => message.role === 'assistant')) {
    res.status(409).json({ code: 'ASSISTANT_MISSING', message: '先保存需要核对的助手消息。' });
    return;
  }
  const fixture = fixtures.bySourceId.get(view.conversation.sourceRecordId)!;
  const message = structuredClone(fixture.feedbackMessage);
  const review = message.parts.find(part => part.type === 'data-review-note')!;
  if (review.type === 'data-review-note') review.data.text = note;
  await validateMessages([message]);
  store.saveFeedback(view.conversation.id, message);
  res.json({ action: 'save-feedback', saved: true, view: store.read(view.conversation.id) });
});

app.post('/api/messages/conversations/:id/prepare', async (req, res) => {
  const view = readView(req, res);
  if (!view) return;
  res.json(await prepareInput(view, fixtures.rule));
});

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const sqlite = error as Error & { errcode?: number };
  if (sqlite.errcode === 5 || sqlite.errcode === 6) {
    res.status(503).json({ code: 'SAVE_LOCKED', message: '写入被另一个连接锁住，尚未保存。请释放锁后再次保存。',
      error: { name: sqlite.name, message: sqlite.message, errcode: sqlite.errcode } });
  } else if (error instanceof z.ZodError) {
    res.status(400).json({ code: 'INVALID_INPUT', message: '输入格式不符合这项操作的要求。', error: error.issues });
  } else if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    res.status(400).json({ code: 'INVALID_INPUT', message: '输入必须是完整 JSON。',
      error: { name: error.name, message: error.message } });
  } else {
    res.status(500).json({ code: 'REQUEST_FAILED', message: '本次操作未能确认，请重新读取记录；输入仍可保留。',
      error: { name: error instanceof Error ? error.name : 'Error', message: String(error) } });
  }
};
app.use('/api/messages', errorHandler);

const vite = await createViteServer({
  root: labRoot, configFile: false, appType: 'spa',
  server: { middlewareMode: true, hmr: false },
});
app.use(vite.middlewares);
const server = app.listen(port, '127.0.0.1', () => {
  console.log(JSON.stringify({ serviceId, processId: process.pid, gitHead, dbPath, logPath,
    url: `http://127.0.0.1:${port}/message-history.html`, modelCalls: 0 }));
});

let closing = false;
async function close(): Promise<void> {
  if (closing) return;
  closing = true;
  if (server.listening) await new Promise<void>((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
  await vite.close();
  store.close();
  console.log(JSON.stringify({ serviceId, endedAt: new Date().toISOString(), closed: true }));
}
process.once('SIGINT', () => { void close(); });
process.once('SIGTERM', () => { void close(); });
server.once('error', async error => { console.error(error); await close(); process.exitCode = 1; });
