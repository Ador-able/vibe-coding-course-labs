import express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { Store } from '../../../../lessons/chapter05/project/src/store.ts';
import { ModelError, readConfig } from '../model.ts';
import { DEFAULT_TASK, TOOL_SETS, type ToolsRun } from './contract.ts';
import { loadInitialWork, readBack, writingTools } from './workspace.ts';
import { executeRun } from './run.ts';
import { toolDefinitions } from './definitions.ts';

const idSchema = z.uuid();
const runInput = z.object({ task: z.string().trim().min(1).max(12000), toolSet: z.enum(['separate', 'combined']) });

export function createToolsRouter(env: NodeJS.ProcessEnv, project: string, directory: string) {
  const router = express.Router(), active = new Map<string, { controller: AbortController; done: Promise<void>; run: ToolsRun }>();
  const recordPath = (id: string) => join(directory, id, 'run.json');
  const read = async (id: string) => {
    const running = active.get(id);
    if (running?.run.state === 'running') return structuredClone(running.run);
    if (running) await running.done;
    return JSON.parse(await readFile(recordPath(id), 'utf8')) as ToolsRun;
  };
  router.get('/materials', async (_req, res, next) => {
    try { const initial = await loadInitialWork(project); res.json({ defaultTask: DEFAULT_TASK, toolSets: TOOL_SETS,
      definitions: { separate: toolDefinitions('separate'), combined: toolDefinitions('combined') }, work: initial.work, seedDigest: initial.digest }); }
    catch (error) { next(error); }
  });
  router.get('/classroom', async (_req, res, next) => {
    try { res.json(JSON.parse(await readFile(join(project, 'classroom.json'), 'utf8')) as ToolsRun[]); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') res.status(404).json({ error: '课堂实录尚未备妥，可以先运行自己的任务。' }); else next(error); }
  });
  router.get('/runs/latest', async (_req, res, next) => {
    try {
      const names = await readdir(directory).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; });
      const records = await Promise.all(names.filter(name => idSchema.safeParse(name).success).map(read));
      const latest = new Map<string, ToolsRun>();
      for (const run of records.sort((a, b) => a.startedAt.localeCompare(b.startedAt))) latest.set(run.toolSet, run);
      res.json([...latest.values()]);
    } catch (error) { next(error); }
  });
  router.get('/runs/:id', async (req, res, next) => {
    if (!idSchema.safeParse(req.params.id).success) { res.status(400).json({ error: '运行编号不正确。' }); return; }
    try { res.json(await read(req.params.id)); } catch (error) { next(error); }
  });
  router.post('/runs/:id/cancel', async (req, res, next) => {
    if (!idSchema.safeParse(req.params.id).success) { res.status(400).json({ error: '运行编号不正确。' }); return; }
    try { const run = await read(req.params.id); active.get(run.id)?.controller.abort(); res.json({ id: run.id, state: run.state }); }
    catch (error) { next(error); }
  });
  router.post('/run', async (req, res, next) => {
    const parsed = runInput.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: '请填写任务，并选择分散读取或组合读取。' }); return; }
    try {
      const config = readConfig(env), initial = await loadInitialWork(project);
      const id = randomUUID(), workspace = join(directory, id), database = join(workspace, 'work.sqlite');
      await mkdir(workspace, { recursive: true });
      const store = new Store(database); try { store.init(initial.work); } finally { store.close(); }
      const run: ToolsRun = { version: 1, source: 'model-api', id, ...parsed.data, configuredModel: config.model, seedDigest: initial.digest,
        startedAt: new Date().toISOString(), state: 'running', stage: '正在准备请求', calls: [], requests: [], report: '', readBack: null,
        usage: { input: null, output: null, cached: null, reasoning: null } };
      // 回调串行落盘；运行中读取内存进度，结束后才读已落盘的记录。
      let writes = Promise.resolve();
      const save = () => {
        const snapshot = JSON.stringify(run, null, 2);
        const nextWrite = writes.then(() => writeFile(recordPath(id), snapshot));
        writes = nextWrite.catch(() => {}); return nextWrite;
      };
      await save(); const controller = new AbortController();
      const runtime = new Store(database);
      res.status(202).json(run);
      const done = executeRun(run, config, { tools: writingTools(runtime, initial.work.id, run.toolSet), close: () => runtime.close(), readBack: () => readBack(database, initial.work.id) }, controller.signal, save)
        .catch(() => { run.state = 'failed'; run.error = '运行记录未能完整保存，请检查本机磁盘。'; })
        .finally(() => { active.delete(id); });
      active.set(id, { controller, done, run });
    } catch (error) {
      if (error instanceof ModelError) res.status(error.httpStatus).json({ error: error.message }); else next(error);
    }
  });
  router.use((error: NodeJS.ErrnoException, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.code === 'ENOENT' ? 404 : 500).json({ error: '教学材料或运行记录未能读写，请检查本机文件。' });
  });
  return { router, close: async () => {
    const pending = [...active.values()]; for (const item of pending) item.controller.abort();
    await Promise.all(pending.map(item => item.done));
  } };
}
