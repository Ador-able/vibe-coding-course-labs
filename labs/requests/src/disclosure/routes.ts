import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readConfig } from '../model.ts';
import { CONDITIONS, QUESTION, type Condition, type DisclosureRun } from './contract.ts';
import { openMaterials } from './materials.ts';
import { runDisclosure } from './flow.ts';

export function createDisclosureRouter(env: NodeJS.ProcessEnv, projectDirectory: string, recordDirectory: string) {
  const router = Router();
  router.get('/materials', async (req, res, next) => {
    try {
      const materials = await openMaterials(projectDirectory);
      if (typeof req.query.path === 'string') res.json(await materials.read(req.query.path));
      else res.json({ question: QUESTION, paths: materials.paths });
    } catch (error) { next(error); }
  });
  router.get('/runs', async (_req, res, next) => {
    try {
      let files: string[];
      try { files = await readdir(recordDirectory); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; files = []; }
      const runs = await Promise.all(files.filter(file => /^[\da-f-]{36}\.json$/.test(file)).map(async file => {
        const run = JSON.parse(await readFile(join(recordDirectory, file), 'utf8')) as DisclosureRun;
        return { id: run.id, condition: run.condition, state: run.state, startedAt: run.startedAt };
      }));
      res.json(runs.sort((a, b) => a.startedAt.localeCompare(b.startedAt)));
    } catch (error) { next(error); }
  });
  router.get('/runs/:id', async (req, res, next) => {
    if (!/^[\da-f-]{36}$/.test(req.params.id)) { res.sendStatus(404); return; }
    try { res.type('json').send(await readFile(join(recordDirectory, `${req.params.id}.json`), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') res.sendStatus(404); else next(error); }
  });
  router.post('/run', async (req, res) => {
    const condition = req.body?.condition;
    if (typeof condition !== 'string' || !Object.hasOwn(CONDITIONS, condition)) { res.status(400).json({ error: '请选择本页的实验条件。' }); return; }
    const run: DisclosureRun = { id: randomUUID(), condition: condition as Condition, startedAt: new Date().toISOString(), state: 'running', requests: [], tools: [], reads: [], supplied: [], answer: null };
    const controller = new AbortController();
    const cancel = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', cancel);
    try {
      const materials = await openMaterials(projectDirectory);
      await runDisclosure(readConfig(env), materials, run, AbortSignal.any([controller.signal, AbortSignal.timeout(180_000)]));
      run.state = 'completed';
    } catch (error) {
      run.state = 'failed'; run.error = error instanceof Error ? error.message : '实验未能完成。';
    } finally {
      try {
        await mkdir(recordDirectory, { recursive: true });
        await writeFile(join(recordDirectory, `${run.id}.json`), JSON.stringify(run, null, 2) + '\n');
      } catch { run.state = 'failed'; run.error = '运行记录无法保存，请检查本机目录是否可写。'; }
      res.off('close', cancel);
    }
    if (!res.destroyed) res.status(run.state === 'completed' ? 200 : 502).json(run);
  });
  return router;
}
