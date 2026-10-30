import express from 'express';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { ModelError, readConfig, type ModelConfig } from '../model.ts';
import { executeRun } from '../tools/run.ts';
import type { ToolCall } from '../tools/contract.ts';
import { MODES, type Classroom, type ControlGroup, type ControlRun } from './contract.ts';
import { loadMaterials, materialTools, toolDefinitions } from './materials.ts';

const inputSchema = z.object({ scenario: z.enum(['known', 'explore']), variant: z.enum(['key', 'time']), task: z.string().trim().min(1).max(12000) });
const instructions = '你在写作工作台进行只读核对。作品和练习稿已由应用绑定。只依据实际取得的资料判断；目录简介只能定位资料，不能代替原文。没有取得的依据保持未知，不虚构读取结果。只读不改稿。汇报简洁，逐项给出必要原句，不复述整篇章稿。';

// 三组共享材料快照与任务，仅改变资料读取由谁安排。
async function compare(run: ControlRun, config: ModelConfig, signal: AbortSignal, changed: () => Promise<void>) {
  try {
    for (const mode of Object.keys(MODES) as (keyof typeof MODES)[]) {
      if (signal.aborted) break;
      const group: ControlGroup = { version: 1, source: 'model-api', id: randomUUID(), mode, task: run.task, provided: [], configuredModel: config.model,
        seedDigest: run.seedDigest, startedAt: new Date().toISOString(), state: 'running', stage: '准备资料', calls: [], requests: [], report: '', readBack: null,
        usage: { input: null, output: null, cached: null, reasoning: null } };
      run.groups.push(group); run.stage = `正在运行${MODES[mode]}`; await changed();
      const tools = materialTools(run.materials, run.variant);
      if (mode !== 'agent') {
        for (const name of ['read_work', 'read_chapter'] as const) {
          const call: ToolCall = { id: randomUUID(), name, input: {}, state: 'running' }; group.provided.push(call); await changed();
          call.output = await tools[name].execute!({}, { toolCallId: call.id, messages: [], context: {}, abortSignal: signal }); call.state = 'completed'; await changed();
        }
      }
      const prompt = run.task + (group.provided.length ? '\n\n应用预先读取的资料（真实工具返回）：\n' + group.provided.map(item => `${item.name}\n${JSON.stringify(item.output)}`).join('\n\n') : '');
      await executeRun(group, config, { tools: mode === 'workflow' ? {} : tools, instructions, prompt, close: () => {}, readBack: () => null }, signal, changed);
    }
    run.state = signal.aborted ? 'cancelled' : run.groups.every(group => group.state === 'completed') ? 'completed' : 'failed';
    run.stage = run.state === 'completed' ? '对照已完成' : run.state === 'cancelled' ? '对照已停止' : '部分组未完整结束';
  } catch (error) {
    run.state = signal.aborted ? 'cancelled' : 'failed'; run.stage = signal.aborted ? '对照已停止' : '对照未完成';
    run.error = signal.aborted ? '已停止后续组，保留本轮已取得的记录。' : error instanceof Error ? error.message : '本轮对照未完成。';
  } finally { await changed(); }
}

export function createControlRouter(env: NodeJS.ProcessEnv, project: string, directory: string) {
  const router = express.Router(), active = new Map<string, { run: ControlRun; controller: AbortController; done: Promise<void> }>();
  const path = (id: string) => join(directory, id, 'run.json');
  const read = async (id: string) => {
    const running = active.get(id); if (running) { if (running.run.state === 'running') return structuredClone(running.run); await running.done; }
    return JSON.parse(await readFile(path(id), 'utf8')) as ControlRun;
  };
  router.get('/materials', async (_req, res, next) => { try { res.json({ materials: await loadMaterials(project), definitions: toolDefinitions() }); } catch (error) { next(error); } });
  router.get('/classroom', async (_req, res, next) => {
    try { res.json(JSON.parse(await readFile(join(project, 'classroom.json'), 'utf8')) as Classroom); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') res.status(404).json({ error: '课堂实录尚未备妥，可以先运行自己的对照。' }); else next(error); }
  });
  router.get('/runs/:id', async (req, res, next) => {
    if (!z.uuid().safeParse(req.params.id).success) { res.status(400).json({ error: '运行编号不正确。' }); return; }
    try { res.json(await read(req.params.id)); } catch (error) { next(error); }
  });
  router.post('/runs/:id/cancel', async (req, res, next) => {
    if (!z.uuid().safeParse(req.params.id).success) { res.status(400).json({ error: '运行编号不正确。' }); return; }
    try { const run = await read(req.params.id); active.get(run.id)?.controller.abort(); res.json({ id: run.id, state: run.state }); } catch (error) { next(error); }
  });
  router.post('/run', async (req, res, next) => {
    const parsed = inputSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: '请选择情境、练习稿并填写任务。' }); return; }
    try {
      const config = readConfig(env), materials = await loadMaterials(project), id = randomUUID();
      const run: ControlRun = { version: 1, source: 'model-api', id, ...parsed.data, materials, configuredModel: config.model,
        seedDigest: createHash('sha256').update(JSON.stringify(materials)).digest('hex'), startedAt: new Date().toISOString(), state: 'running', stage: '准备对照', groups: [] };
      await mkdir(join(directory, id), { recursive: true });
      let writes = Promise.resolve();
      const save = () => { const snapshot = JSON.stringify(run, null, 2), nextWrite = writes.then(() => writeFile(path(id), snapshot)); writes = nextWrite.catch(() => {}); return nextWrite; };
      await save(); const controller = new AbortController(); res.status(202).json(run);
      const done = compare(run, config, controller.signal, save)
        .catch(() => { run.state = 'failed'; run.error = '运行记录未能完整保存，请检查本机磁盘。'; })
        .finally(() => active.delete(id));
      active.set(id, { run, controller, done });
    } catch (error) { if (error instanceof ModelError) res.status(error.httpStatus).json({ error: error.message }); else next(error); }
  });
  router.use((error: NodeJS.ErrnoException, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.code === 'ENOENT' ? 404 : 500).json({ error: '教学资料或运行记录未能读写，请检查本机文件。' });
  });
  return { router, close: async () => { const pending = [...active.values()]; pending.forEach(item => item.controller.abort()); await Promise.all(pending.map(item => item.done)); } };
}
