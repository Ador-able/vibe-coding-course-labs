import express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ModelError, readConfig } from '../model.ts';
import { sendRecordedRequest, isObject } from '../recorded-model.ts';
import { LESSONS, PLAN, type RunInput, type TaskRun } from './contract.ts';
import { loadMaterials, buildPrompt, criteria } from './materials.ts';
import { checkOutput } from './checks.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createTasksRouter(env: NodeJS.ProcessEnv, project: string, directory: string) {
  const router = express.Router();
  const materials = () => loadMaterials(project);
  const save = async (run: TaskRun) => { await mkdir(directory, { recursive: true }); await writeFile(join(directory, `${run.id}.json`), JSON.stringify(run, null, 2)); };
  const read = async (id: string) => JSON.parse(await readFile(join(directory, `${id}.json`), 'utf8')) as TaskRun;
  router.get('/materials', async (_req, res, next) => {
    try { res.json({ ...await materials(), criteria: Object.fromEntries(['S1', 'S2', 'S3'].map(id => [id, criteria(id as TaskRun['caseId'])])) }); }
    catch (error) { next(error); }
  });
  router.get('/runs', async (_req, res, next) => {
    try {
      const names = await readdir(directory).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; });
      const runs = await Promise.all(names.filter(name => uuid.test(name.slice(0, -5)) && name.endsWith('.json')).map(name => read(name.slice(0, -5))));
      res.json(runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
    } catch (error) { next(error); }
  });
  router.put('/runs/:id/judgments', async (req, res, next) => {
    if (!uuid.test(req.params.id)) { res.status(400).json({ error: '运行编号不正确。' }); return; }
    try {
      const run = await read(req.params.id);
      const allowed = criteria(run.caseId).map(item => item.id);
      if (run.lesson === 'cost') allowed.push('scope');
      const input: unknown = req.body;
      if (!isObject(input) || Object.entries(input).some(([key, value]) => !allowed.includes(key) || !isObject(value) || !['pass', 'fail', 'pending'].includes(String(value.decision)) || typeof value.evidence !== 'string' || value.evidence.length > 3000 || value.decision !== 'pending' && !value.evidence.trim())) {
        res.status(400).json({ error: '请选择待核、符合或不符合，并为判断填写原句与依据。' }); return;
      }
      run.judgments = input as TaskRun['judgments']; await save(run); res.json(run);
    } catch (error) { next(error); }
  });
  router.post('/run', async (req, res, next) => {
    const input = req.body as RunInput;
    if (!input || !Object.hasOwn(LESSONS, input.lesson) || !uuid.test(input.batchId ?? '') || !PLAN[input.lesson].some(item => item.caseId === input.caseId && item.method === input.method) || input.parentId !== undefined && !uuid.test(input.parentId) || input.effort !== undefined && !['low', 'high', 'max'].includes(input.effort)) {
      res.status(400).json({ error: '实验条件不正确，请重新选择实验。' }); return;
    }
    let run: TaskRun | undefined;
    const controller = new AbortController();
    const cancel = () => controller.abort(); res.on('close', cancel);
    try {
      let parent: TaskRun | undefined;
      if (input.lesson === 'cost' && input.method === 'B') {
        if (!input.parentId) { res.status(400).json({ error: '请先生成这一对的真实初稿。' }); return; }
        parent = await read(input.parentId);
        if (parent.lesson !== 'cost' || parent.method !== 'A' || parent.batchId !== input.batchId || parent.caseId !== input.caseId || parent.state !== 'completed') {
          res.status(400).json({ error: '核对必须使用同一对已完成的初稿。' }); return;
        }
      }
      const config = readConfig(env), loaded = await materials();
      if (parent && (parent.configuredModel !== config.model || parent.baseUrl !== config.baseUrl || parent.effort !== input.effort)) {
        res.status(400).json({ error: '这一对的模型配置已变化，请重新生成初稿再比较。' }); return;
      }
      const startedAt = new Date().toISOString();
      run = { lesson: input.lesson, caseId: input.caseId, method: input.method, batchId: input.batchId, ...(input.effort ? { effort: input.effort } : {}), ...(parent ? { parentId: parent.id } : {}), id: randomUUID(), startedAt, configuredModel: config.model, baseUrl: config.baseUrl,
        state: 'running', output: '', checks: checkOutput(''), judgments: {},
        request: { step: `${input.caseId} / ${input.method}`, startedAt, requestBody: JSON.stringify({ model: config.model, max_tokens: 16384, ...(input.effort ? { reasoning_effort: input.effort } : {}), messages: [{ role: 'user', content: buildPrompt(input, loaded, parent) }] }) } };
      await save(run);
      try {
        const message = await sendRecordedRequest(config, run.request, AbortSignal.any([controller.signal, AbortSignal.timeout(180_000)]));
        run.output = isObject(message) && typeof message.content === 'string' ? message.content : '';
        if (!run.output.trim() || run.request.finishReason !== 'stop') throw new ModelError('MODEL_RESPONSE_INVALID', run.request.finishReason === 'length' ? '模型已用完本次输出额度，未正常结束；本次调用及用量已保留。' : '没有取得正常结束的完整章稿，请查看实际返回与结束原因。');
        run.state = 'completed';
      } catch (error) {
        if (isObject(run.request.responseMessage) && typeof run.request.responseMessage.content === 'string') run.output = run.request.responseMessage.content;
        run.state = 'failed'; run.error = error instanceof Error ? error.message : '模型调用未完成。';
      }
      run.checks = checkOutput(run.output, input.lesson === 'feedback' ? loaded.original : undefined);
      await save(run);
      if (!res.destroyed) res.json(run);
    } catch (error) {
      if (run) { run.state = 'failed'; run.error = '运行记录未能完整保存，请检查本机磁盘。'; }
      if (error instanceof ModelError) res.status(error.httpStatus).json({ error: error.message }); else next(error);
    } finally { res.off('close', cancel); }
  });
  router.use((error: NodeJS.ErrnoException, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.code === 'ENOENT' ? 404 : 500).json({ error: '实验资料或运行记录未能读写，请检查文件与本机磁盘。' });
  });
  return router;
}
