import express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { Store } from '../../../../lessons/chapter05/project/src/store.ts';
import { ModelError, readConfig } from '../model.ts';
import { executeRun } from '../tools/run.ts';
import { DEFAULT_TASK, type FeedbackRun } from './contract.ts';
import { feedbackTools, loadMaterials, prepareWorkspace, readBack, toolDefinitions } from './workspace.ts';

const inputSchema = z.object({ task: z.string().trim().min(1).max(12000), predecessor: z.object({ title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(12000) }) });

export function createToolResultsRouter(env: NodeJS.ProcessEnv, project: string, directory: string) {
  const router = express.Router(), active = new Map<string, { controller: AbortController; done: Promise<void>; run: FeedbackRun }>();
  const path = (id: string) => join(directory, id, 'run.json');
  const read = async (id: string) => {
    const running = active.get(id); if (running) { if (running.run.state === 'running') return structuredClone(running.run); await running.done; }
    return JSON.parse(await readFile(path(id), 'utf8')) as FeedbackRun;
  };
  router.get('/materials', async (_req, res, next) => {
    try { const materials = await loadMaterials(project); res.json({ defaultTask: DEFAULT_TASK, definitions: toolDefinitions(), work: materials.work, predecessor: materials.chapters.current }); }
    catch (error) { next(error); }
  });
  router.get('/classroom', async (_req, res, next) => {
    try { res.json(JSON.parse(await readFile(join(project, 'classroom.json'), 'utf8')) as FeedbackRun); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') res.status(404).json({ error: '课堂实录尚未备妥，可以先运行自己的任务。' }); else next(error); }
  });
  router.get('/runs/:id', async (req, res, next) => {
    if (!z.uuid().safeParse(req.params.id).success) { res.status(400).json({ error: '运行编号不正确。' }); return; }
    try { res.json(await read(req.params.id)); } catch (error) { next(error); }
  });
  router.post('/runs/:id/cancel', async (req, res, next) => {
    if (!z.uuid().safeParse(req.params.id).success) { res.status(400).json({ error: '运行编号不正确。' }); return; }
    try { const run = await read(req.params.id); active.get(run.id)?.controller.abort(); res.json({ id: run.id, state: run.state }); }
    catch (error) { next(error); }
  });
  router.post('/run', async (req, res, next) => {
    const parsed = inputSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: '请填写任务与第一章正文。' }); return; }
    try {
      const config = readConfig(env), id = randomUUID(), workspace = join(directory, id), database = join(workspace, 'work.sqlite');
      await mkdir(workspace, { recursive: true });
      const initial = await prepareWorkspace(project, database, parsed.data.predecessor);
      const run: FeedbackRun = { version: 1, source: 'model-api', id, ...parsed.data, configuredModel: config.model, seedDigest: initial.seedDigest,
        startedAt: new Date().toISOString(), state: 'running', stage: '正在准备请求', calls: [], requests: [], report: '', readBack: null,
        usage: { input: null, output: null, cached: null, reasoning: null } };
      let writes = Promise.resolve();
      const save = () => { const snapshot = JSON.stringify(run, null, 2), nextWrite = writes.then(() => writeFile(path(id), snapshot)); writes = nextWrite.catch(() => {}); return nextWrite; };
      await save(); const controller = new AbortController(), store = new Store(database);
      res.status(202).json(run);
      const done = executeRun(run, config, { tools: feedbackTools(store, initial.workId), close: () => store.close(), readBack: () => readBack(database, initial.workId) }, controller.signal, save)
        .catch(() => { run.state = 'failed'; run.error = '运行记录未能完整保存，请检查本机磁盘。'; })
        .finally(() => { active.delete(id); });
      active.set(id, { controller, done, run });
    } catch (error) { if (error instanceof ModelError) res.status(error.httpStatus).json({ error: error.message }); else next(error); }
  });
  router.use((error: NodeJS.ErrnoException, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.code === 'ENOENT' ? 404 : 500).json({ error: '教学材料或运行记录未能读写，请检查本机文件。' });
  });
  return { router, close: async () => { const pending = [...active.values()]; pending.forEach(item => item.controller.abort()); await Promise.all(pending.map(item => item.done)); } };
}
