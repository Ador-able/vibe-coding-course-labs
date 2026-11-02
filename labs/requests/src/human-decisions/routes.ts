import express from 'express';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { Store } from '../../../../lessons/chapter05/project/src/store.ts';
import { LabError } from '../../../../lessons/chapter05/project/src/schemas.ts';
import { ModelError, readConfig, type ModelConfig } from '../model.ts';
import { DEFAULT_TASK, type HumanRun, type Phase } from './contract.ts';
import { actionMessage, approvalMessage, runModel } from './model.ts';
import { loadMaterials, PENDING_DIRECTION, saveSchema, snapshot, toolDefinitions } from './workspace.ts';

const version = z.number().int().positive();
const text = z.string().trim().min(1).max(60000);
const startSchema = z.object({ phase: z.enum(['direction', 'approval']), task: z.string().trim().min(1).max(12000).optional(), input: saveSchema.optional() });

export function createHumanDecisionsRouter(env: NodeJS.ProcessEnv, project: string, directory: string) {
  const router = express.Router(), active = new Map<string, { run: HumanRun; controller: AbortController; done: Promise<void> }>();
  const writes = new Map<string, Promise<void>>(), mutations = new Set<string>();
  const path = (id: string) => join(directory, id, 'run.json'), database = (id: string) => join(directory, id, 'work.sqlite');
  const save = (run: HumanRun) => {
    run.revision += 1; const content = JSON.stringify(run, null, 2) + '\n';
    const next = (writes.get(run.id) ?? Promise.resolve()).then(() => writeFile(path(run.id), content));
    writes.set(run.id, next.catch(() => {})); return next;
  };
  const read = async (id: string) => {
    const current = active.get(id); if (current) { if (current.run.state === 'running') return structuredClone(current.run); await current.done; }
    await writes.get(id); return JSON.parse(await readFile(path(id), 'utf8')) as HumanRun;
  };
  const event = (run: HumanRun, kind: string, value: unknown) => run.events.push({ kind, at: new Date().toISOString(), value });
  const withStore = <T>(run: HumanRun, action: (store: Store) => T): T => {
    const store = new Store(database(run.id)); try { return action(store); } finally { store.close(); }
  };
  const refresh = (run: HumanRun) => Object.assign(run, snapshot(database(run.id), run.work.id));
  const current = (run: HumanRun, revision: number) => {
    if (active.has(run.id) || run.state === 'running') throw new LabError('RUN_BUSY', '任务正在执行，请等待本轮结果。');
    if (run.revision !== revision) throw new LabError('STALE_RUN', '本轮状态已经改变，请重新读取后决定。');
  };
  const action = (run: HumanRun, approvalId: string) => {
    if (!run.pending || run.pending.approvalId !== approvalId) throw new LabError('APPROVAL_NOT_CURRENT', '这项批准不对应当前请求，请核对新的操作对象与参数。');
    return run.pending;
  };
  const execute = (run: HumanRun, mode: 'normal' | 'propose' | 'replace' | 'resume', config: ModelConfig) => {
    const controller = new AbortController(); run.state = 'running'; run.error = undefined;
    const done = runModel(run, config, database(run.id), controller.signal, () => save(run), mode)
      .catch(() => { run.state = 'failed'; run.error = '运行记录未能完整保存，请检查本机磁盘。'; })
      .finally(() => active.delete(run.id));
    active.set(run.id, { run, controller, done });
  };
  router.get('/materials', async (_req, res, next) => { try { res.json({ materials: await loadMaterials(project), definitions: toolDefinitions(), defaultTask: DEFAULT_TASK }); } catch (error) { next(error); } });
  router.get('/classroom', async (_req, res, next) => {
    try { res.json(JSON.parse(await readFile(join(project, 'classroom.json'), 'utf8'))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') res.status(404).json({ error: '课堂实录尚未备妥，可以先运行自己的任务。' }); else next(error); }
  });
  router.get('/current', async (req, res, next) => {
    const phase = z.enum(['direction', 'approval']).safeParse(req.query.phase); if (!phase.success) { res.status(400).json({ error: '请选择实验环节。' }); return; }
    try { const id = (await readFile(join(directory, 'current-' + phase.data + '.txt'), 'utf8')).trim(); res.json(await read(id)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') res.json(null); else next(error); }
  });
  router.param('id', (req, res, next, id) => { if (!z.uuid().safeParse(id).success) { res.status(400).json({ error: '运行编号不正确。' }); return; } next(); });
  router.get('/runs/:id', async (req, res, next) => { try { const run = await read(String(req.params.id)); if (run.state !== 'running') refresh(run); res.json(run); } catch (error) { next(error); } });
  router.post('/run', async (req, res, next) => {
    const input = startSchema.safeParse(req.body); if (!input.success) { res.status(400).json({ error: '请填写本环节的任务或保存参数。' }); return; }
    try {
      const config = readConfig(env), materials = await loadMaterials(project), id = randomUUID(); await mkdir(join(directory, id), { recursive: true });
      const store = new Store(database(id)); let work;
      try { work = store.init(materials.work); } finally { store.close(); }
      const intent = input.data.phase === 'approval' ? input.data.input ?? materials.actions.C : null;
      if (intent && (intent.workId !== work.id || intent.expectedWorkRevision !== 1 || intent.expectedChapterRevision !== 0 || intent.expectedPreviousRevisions.length)) throw new LabError('ACTION_INITIAL_STATE', '本轮保存提议应对应空的第一章及当前要求修订。');
      const task = input.data.phase === 'direction' ? input.data.task ?? DEFAULT_TASK : '核对并批准一次具体的第一章草稿保存。';
      const run: HumanRun = { version: 1, source: 'model-api', id, revision: 1, phase: input.data.phase, task, configuredModel: config.model,
        seedDigest: createHash('sha256').update(JSON.stringify(materials)).digest('hex'), startedAt: new Date().toISOString(), state: 'running', stage: '准备任务',
        messages: intent ? [actionMessage(intent)] : [{ role: 'user', content: task }], requests: [], calls: [], events: [], report: '', question: null, choice: null, pending: null, decision: null, intent, work, readBack: null };
      await save(run); await writeFile(join(directory, 'current-' + run.phase + '.txt'), id); execute(run, intent ? 'propose' : 'normal', config); res.status(202).json(run);
    } catch (error) { next(error); }
  });
  const mutation = <T extends { revision: number }>(suffix: string, schema: z.ZodType<T>, apply: (run: HumanRun, input: T) => Promise<'normal' | 'propose' | 'replace' | 'resume' | void> | 'normal' | 'propose' | 'replace' | 'resume' | void) => {
    router.post('/runs/:id/' + suffix, async (req, res, next) => {
      const parsed = schema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: '请核对当前对象与填写内容。' }); return; }
      const id = String(req.params.id);
      if (mutations.has(id)) { res.status(409).json({ code: 'RUN_BUSY', error: '正在处理当前决定，请等待结果后再继续。' }); return; }
      mutations.add(id); let run: HumanRun | undefined;
      try {
        run = await read(id); current(run, parsed.data.revision);
        const config = ['answer', 'replace', 'resume'].includes(suffix) ? readConfig(env) : undefined;
        const mode = await apply(run, parsed.data); refresh(run); await save(run);
        if (mode) execute(run, mode, config!); res.status(mode ? 202 : 200).json(run);
      } catch (error) {
        if (run && error instanceof LabError && ['STALE_CHAPTER', 'APPROVAL_NOT_CURRENT'].includes(error.code)) { refresh(run); event(run, suffix + '-rejected', { code: error.code, message: error.message, request: parsed.data, readBack: run.readBack }); await save(run); }
        next(error);
      } finally { mutations.delete(id); }
    });
  };
  mutation('answer', z.object({ revision: version, toolCallId: z.string().min(1), choice: z.enum(['A', 'B']) }), (run, input) => {
    if (run.phase !== 'direction' || run.state !== 'awaiting-direction' || run.question?.toolCallId !== input.toolCallId) throw new LabError('QUESTION_NOT_CURRENT', '这个回答不对应当前待答问题。');
    const question = run.question!;
    const chosen = question.options.find(option => option.id === input.choice); if (!chosen) throw new LabError('CHOICE_UNKNOWN', '问题中没有这个选项。');
    const work = withStore(run, store => { const current = store.getWork(run.work.id); const { revision, ...data } = current; return store.updateWork({ ...data, requirements: [...data.requirements.filter(item => item !== PENDING_DIRECTION), '人的叙事切入决定：' + chosen.label] }, revision); });
    run.choice = { id: chosen.id, text: chosen.label, workRevision: work.revision };
    const call = run.calls.find(item => item.id === question.toolCallId); if (call) { call.state = 'completed'; call.output = run.choice; }
    run.messages.push({ role: 'tool', content: [{ type: 'tool-result', toolCallId: question.toolCallId, toolName: 'ask_direction', output: { type: 'json', value: run.choice } }] });
    event(run, 'direction-answer', { question, choice: run.choice, work }); run.question = null; return 'normal';
  });
  mutation('edit', z.object({ revision: version, chapterRevision: version, title: text, body: text }), (run, input) => {
    if (run.phase !== 'direction') throw new LabError('PHASE_MISMATCH', '请在改稿与采用环节修改实际稿件。');
    const saved = withStore(run, store => store.saveDraft({ workId: run.work.id, chapterNumber: 1, expectedWorkRevision: store.getWork(run.work.id).revision, expectedChapterRevision: input.chapterRevision, expectedPreviousRevisions: [], title: input.title, body: input.body }, 'human'));
    event(run, 'human-edit', { expectedRevision: input.chapterRevision, saved });
  });
  mutation('adopt', z.object({ revision: version, chapterRevision: version, note: z.string().trim().max(2000).default('已阅读这份稿件。') }), (run, input) => {
    if (run.phase !== 'direction') throw new LabError('PHASE_MISMATCH', '请在改稿与采用环节判断实际稿件。');
    const saved = withStore(run, store => store.adopt(run.work.id, 1, input.chapterRevision, input.note)); event(run, 'human-adopt', { expectedRevision: input.chapterRevision, saved });
  });
  mutation('decide', z.object({ revision: version, approvalId: z.string().min(1), approved: z.boolean(), reason: z.string().trim().min(1).max(2000) }), (run, input) => {
    action(run, input.approvalId); if (run.state !== 'awaiting-approval') throw new LabError('DECISION_ALREADY_RECORDED', '当前请求已经有决定，请继续处理或修改提议。');
    run.decision = { approvalId: input.approvalId, approved: input.approved, reason: input.reason }; run.state = 'decision-recorded'; run.stage = input.approved ? '批准已记录，尚未执行' : '拒绝已记录，尚未接续';
    event(run, 'human-approval', { action: run.pending, decision: run.decision, readBackBeforeExecution: snapshot(database(run.id), run.work.id).readBack });
  });
  mutation('replace', z.object({ revision: version, approvalId: z.string().min(1), input: saveSchema }), (run, input) => {
    const previous = action(run, input.approvalId);
    if (run.state !== 'awaiting-approval' && run.state !== 'decision-recorded') throw new LabError('ACTION_NOT_PENDING', '当前没有可以修改的待决提议。');
    if (input.input.workId !== run.work.id) throw new LabError('WORK_MISMATCH', '新请求应保存本轮作品。');
    event(run, 'human-replacement', { previous, priorDecision: run.decision, input: input.input });
    run.messages.push(approvalMessage(previous.approvalId, false, '人撤回原提议并提交新参数；原批准不再用于新动作。'));
    run.intent = input.input; run.pending = null; run.decision = null; return 'replace';
  });
  mutation('resume', z.object({ revision: version, approvalId: z.string().min(1) }), (run, input) => {
    action(run, input.approvalId); if (run.state !== 'decision-recorded' || run.decision?.approvalId !== input.approvalId) throw new LabError('DECISION_REQUIRED', '请先对当前具体请求作出批准或拒绝。');
    const decision = run.decision!;
    event(run, 'resume-operation', { action: run.pending, decision }); run.messages.push(approvalMessage(input.approvalId, decision.approved, decision.reason)); return 'resume';
  });
  router.post('/runs/:id/cancel', async (req, res, next) => { try { const run = await read(String(req.params.id)); active.get(run.id)?.controller.abort(); res.json({ id: run.id, state: run.state }); } catch (error) { next(error); } });
  router.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ModelError) res.status(error.httpStatus).json({ code: error.code, error: error.message });
    else if (error instanceof LabError) res.status(409).json({ code: error.code, error: error.message });
    else res.status((error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500).json({ error: '教学材料或运行记录未能读写，请检查本机文件。' });
  });
  return { router, close: async () => { const pending = [...active.values()]; pending.forEach(item => item.controller.abort()); await Promise.all(pending.map(item => item.done)); } };
}
