import express from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { ModelError, readConfig } from '../model.ts';
import { Store } from '../../../../lessons/chapter05/project/src/store.ts';
import { LabError } from '../../../../lessons/chapter05/project/src/schemas.ts';
import { PENDING_DIRECTION } from '../human-decisions/workspace.ts';
import { DEFAULT_LIMITS, SCENARIOS, TASKS, type Run } from './contract.ts';
import { execute, stop } from './run.ts';
import { loadMaterials, prepare, readBack, toolDefinitions } from './workspace.ts';

const scenarioSchema = z.enum(['A', 'B', 'C', 'cancel']);
const inputSchema = z.object({ scenario: scenarioSchema, task: z.string().trim().min(1).max(12000),
  limits: z.object({ maxSteps: z.number().int().min(1).max(64), maxSeconds: z.number().int().min(0).max(3600) }).default(DEFAULT_LIMITS) });

export function createAgentStoppingRouter(env: NodeJS.ProcessEnv, project: string, directory: string) {
  const router = express.Router(), active = new Map<string, { run: Run; controller: AbortController; done: Promise<void> }>();
  const writes = new Map<string, Promise<void>>(), answering = new Set<string>();
  const path = (id: string) => join(directory, id, 'run.json'), database = (id: string) => join(directory, id, 'work.sqlite');
  const save = (run: Run) => {
    const content = JSON.stringify(run, null, 2) + '\n';
    const next = (writes.get(run.id) ?? Promise.resolve()).then(() => writeFile(path(run.id), content));
    writes.set(run.id, next.catch(() => {})); return next;
  };
  const read = async (id: string) => {
    const running = active.get(id);
    if (running?.run.state === 'running') return structuredClone(running.run);
    if (running) await running.done;
    await writes.get(id); const run = JSON.parse(await readFile(path(id), 'utf8')) as Run;
    // 服务重启不能让持久记录永远停在运行中，也不把中断误记为人的取消。
    if (run.state === 'running') {
      try { run.readBack = readBack(database(id), run.work.id); }
      catch { run.readBack = undefined; run.error = '本轮数据库未能独立读回。'; }
      stop(run, 'interrupted', 'service-interrupted', '本机运行已中断，任务未确认完成。', ['核对保留的任务、工具记录与实际稿件后再决定下一步。']);
      run.events.push({ type: 'interrupted', at: new Date().toISOString(), value: { stop: run.stop, readBack: run.readBack } }); await save(run);
    }
    return run;
  };
  const launch = (run: Run, config: ReturnType<typeof readConfig>) => {
    const controller = new AbortController(); run.state = 'running'; run.stop = undefined; run.error = undefined;
    const remainingMs = run.limits.maxSeconds * 1000 - (run.durationMs ?? 0);
    if (run.limits.maxSeconds && remainingMs <= 0) controller.abort({ kind: 'time-limit' });
    const timer = run.limits.maxSeconds && remainingMs > 0 ? setTimeout(() => controller.abort({ kind: 'time-limit' }), remainingMs) : undefined;
    const done = execute(run, config, database(run.id), controller.signal, () => save(run))
      .catch(() => { run.state = 'failed'; run.error = '运行记录未能完整保存，请检查本机磁盘。'; })
      .finally(() => { if (timer) clearTimeout(timer); active.delete(run.id); });
    active.set(run.id, { run, controller, done });
  };
  router.get('/materials', async (_req, res, next) => {
    try { res.json({ materials: await loadMaterials(project), definitions: toolDefinitions(), scenarios: SCENARIOS, tasks: TASKS, limits: DEFAULT_LIMITS }); }
    catch (error) { next(error); }
  });
  router.get('/classroom', async (_req, res, next) => {
    try { res.json(JSON.parse(await readFile(join(project, 'classroom.json'), 'utf8'))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') res.status(404).json({ error: '本节课堂实录尚未备妥，可以先运行自己的任务。' }); else next(error); }
  });
  router.get('/current', async (req, res, next) => {
    const scenario = scenarioSchema.safeParse(req.query.scenario);
    if (!scenario.success) { res.status(400).json({ error: '请选择实验情境。' }); return; }
    try { const id = (await readFile(join(directory, 'current-' + scenario.data + '.txt'), 'utf8')).trim(); res.json(await read(id)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') res.json(null); else next(error); }
  });
  router.param('id', (req, res, next, id) => { if (!z.uuid().safeParse(id).success) { res.status(400).json({ error: '运行编号不正确。' }); return; } next(); });
  router.get('/runs/:id', async (req, res, next) => { try { res.json(await read(String(req.params.id))); } catch (error) { next(error); } });
  router.post('/run', async (req, res, next) => {
    const input = inputSchema.safeParse(req.body);
    if (!input.success) { res.status(400).json({ error: '请填写任务；模型调用上限为1—64次，时限为0—3600秒，0表示不设时限。' }); return; }
    try {
      const config = readConfig(env), materials = await loadMaterials(project), id = randomUUID();
      await mkdir(join(directory, id), { recursive: true }); const initial = prepare(database(id), materials, input.data.scenario);
      const run: Run = { version: 1, source: 'model-api', id, ...input.data, configuredModel: config.model,
        seedDigest: createHash('sha256').update(JSON.stringify(materials)).digest('hex'), startedAt: new Date().toISOString(),
        state: 'running', stage: '准备任务', ...initial, initialChapterSource: input.data.scenario === 'cancel' ? materials.initialChapterSource : null,
        calls: [], requests: [], messages: [{ role: 'user', content: input.data.task }], events: [], report: '', question: null, answer: null, modelSteps: 0 };
      await save(run); launch(run, config); await writeFile(join(directory, 'current-' + run.scenario + '.txt'), id); res.status(202).json(run);
    } catch (error) { next(error); }
  });
  router.post('/runs/:id/answer', async (req, res, next) => {
    const parsed = z.object({ toolCallId: z.string().min(1), choice: z.enum(['A', 'B']).optional(), answer: z.string().trim().min(1).max(4000).optional() })
      .refine(input => !!input.choice !== !!input.answer).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: '请选择一个方案，或单独填写你的开场方向。' }); return; }
    const id = String(req.params.id);
    if (answering.has(id)) { res.status(409).json({ error: '正在处理这个回答，请等待本轮结果。' }); return; }
    answering.add(id);
    try {
      const run = await read(id), input = parsed.data;
      if (active.has(id) || run.state !== 'waiting' || run.question?.toolCallId !== input.toolCallId) throw new LabError('QUESTION_NOT_CURRENT', '回答不对应当前待决问题。');
      const config = readConfig(env), question = run.question;
      const text = input.answer ?? question.options.find(option => option.id === input.choice)?.label;
      if (!text) throw new LabError('CHOICE_UNKNOWN', '当前问题没有这个选项，请核对后回答。');
      const store = new Store(database(id));
      try {
        const { revision, ...current } = store.getWork(run.work.id);
        run.work = store.updateWork({ ...current, requirements: [...current.requirements.filter(item => item !== PENDING_DIRECTION), '人的叙事切入决定：' + text] }, revision);
      } finally { store.close(); }
      run.answer = { toolCallId: question.toolCallId, text, workRevision: run.work.revision };
      const call = run.calls.find(item => item.id === question.toolCallId); if (call) { call.state = 'completed'; call.output = run.answer; }
      run.messages.push({ role: 'tool', content: [{ type: 'tool-result', toolCallId: question.toolCallId, toolName: 'ask_direction', output: { type: 'json', value: run.answer } }] });
      run.events.push({ type: 'author-answer', at: new Date().toISOString(), value: { question, answer: run.answer, work: run.work, readBack: readBack(database(id), run.work.id) } });
      run.question = null; await save(run); launch(run, config); res.status(202).json(run);
    } catch (error) { next(error); }
    finally { answering.delete(id); }
  });
  router.post('/runs/:id/cancel', async (req, res, next) => {
    try {
      const id = String(req.params.id), running = active.get(id);
      if (running && running.run.state === 'running') {
        if (!running.controller.signal.aborted) {
          running.run.events.push({ type: 'cancel-requested', at: new Date().toISOString(), value: { request: '取消本轮后续处理' } });
          running.controller.abort({ kind: 'user-cancel' }); await save(running.run);
        }
        res.status(202).json({ id, state: running.run.state });
      } else res.json(await read(id));
    } catch (error) { next(error); }
  });
  router.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ModelError) res.status(error.httpStatus).json({ code: error.code, error: error.message });
    else if (error instanceof LabError) res.status(409).json({ code: error.code, error: error.message });
    else res.status((error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500).json({ error: '材料、数据库或运行记录未能读写，请检查本机文件。' });
  });
  return { router, close: async () => { const running = [...active.values()]; running.forEach(item => item.controller.abort({ kind: 'service-close' })); await Promise.all(running.map(item => item.done)); } };
}
