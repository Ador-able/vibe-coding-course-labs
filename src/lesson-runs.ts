import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Router } from 'express';
import { lessonActions } from '../shared/lesson-actions.ts';

type Run = { id: string; chapter: string; action: string; state: 'running' | 'stopping' | 'completed' | 'failed' | 'stopped'; log: string; error?: string; files: { name: string; path: string }[] };
async function entries(directory: string) {
  try { return await readdir(directory, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
}
function stopChild(child: ChildProcess) {
  if (!child.pid) return;
  // 停止本次进程树，避免 SDK 子进程继续请求；已保存的实验文件仍保留。
  if (process.platform === 'win32') execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
  else { try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; } }
}

export function createLessonRuns(root: string) {
  const router = Router(), runs = new Map<string, Run>();
  let active: { run: Run; child?: ChildProcess } | undefined;
  const publicRun = (run: Run) => ({ ...run, files: run.files.map(({ name }, index) => ({ name, url: `/api/lesson-runs/${run.id}/files/${index}` })) });
  router.get('/', (req, res) => {
    const run = [...runs.values()].findLast(row => row.chapter === req.query.chapter);
    res.json({ run: run ? publicRun(run) : null });
  });
  router.post('/', async (req, res, next) => {
    const { chapter, action: id } = req.body || {};
    const action = typeof chapter === 'string' && typeof id === 'string' && Object.hasOwn(lessonActions, chapter) ? lessonActions[chapter].find(row => row.id === id) : undefined;
    if (!action) { res.status(400).json({ error: '请选择本页的实验条件。' }); return; }
    if (active) { res.status(409).json({ error: '另一个实验仍在运行，请先等待或停止它。' }); return; }
    const run: Run = { id: randomUUID(), chapter, action: id, state: 'running', log: '', files: [] };
    const task = { run, child: undefined as ChildProcess | undefined }; active = task; runs.set(run.id, run);
    const cwd = join(root, 'lessons', chapter, 'project'), recordRoot = join(cwd, action.records);
    try {
      const before = new Set((await entries(recordRoot)).map(row => row.name));
      res.status(202).json(publicRun(run));
      void (async () => {
        let outcome: Run['state'] = 'completed';
        try {
          for (const step of action.steps) {
            if (run.state === 'stopping') break;
            const argv = step.map(value => value === '$run' ? `web-${run.id}` : value);
            await new Promise<void>((resolve, reject) => {
              const child = spawn(process.execPath, argv, { cwd, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] }); task.child = child;
              child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
              child.stdout.on('data', text => { run.log += text; }); child.stderr.on('data', text => { run.log += text; });
              child.on('error', reject);
              child.on('close', code => { task.child = undefined; code === 0 ? resolve() : reject(new Error(`本次实验未完成（退出码 ${code ?? '未知'}）。`)); });
            });
          }
          outcome = run.state === 'stopping' ? 'stopped' : 'completed';
        } catch (error) {
          if (run.state === 'stopping') outcome = 'stopped';
          else { outcome = 'failed'; run.error = error instanceof Error ? error.message : '实验未完成。'; }
        } finally {
          try {
            async function collect(directory: string) {
              for (const entry of await entries(directory)) {
                const file = join(directory, entry.name);
                if (entry.isDirectory() && !/private|codex-home|empty-workspace/.test(entry.name)) await collect(file);
                else if (entry.isFile() && /\.(txt|md|json|jsonl|csv)$/.test(entry.name) && !/^(auth|model|tokens|credentials)\.json$/.test(entry.name)) run.files.push({ name: relative(recordRoot, file).replaceAll('\\', '/'), path: file });
              }
            }
            for (const entry of await entries(recordRoot)) if (!before.has(entry.name) && entry.isDirectory() && !/private|codex-home/.test(entry.name)) await collect(join(recordRoot, entry.name));
          } catch (error) { run.error = `运行记录未能完整读回：${(error as Error).message}`; outcome = 'failed'; }
          run.state = run.state === 'stopping' ? 'stopped' : outcome;
          active = undefined;
        }
      })();
    } catch (error) { active = undefined; runs.delete(run.id); next(error); }
  });
  router.get('/:id', (req, res) => {
    const run = runs.get(req.params.id); if (!run) { res.sendStatus(404); return; }
    res.json(publicRun(run));
  });
  router.post('/:id/stop', (req, res) => {
    if (active?.run.id !== req.params.id) { res.status(409).json({ error: '这次实验已经结束。' }); return; }
    active.run.state = 'stopping'; if (active.child) stopChild(active.child);
    res.json(publicRun(active.run));
  });
  router.get('/:id/files/:index', async (req, res, next) => {
    const index = Number(req.params.index), file = runs.get(req.params.id)?.files[index];
    if (!Number.isInteger(index) || !file) { res.sendStatus(404); return; }
    try { res.type('text/plain').send(await readFile(file.path, 'utf8')); } catch (error) { next(error); }
  });
  return { router, close: () => { if (active) { active.run.state = 'stopping'; if (active.child) stopChild(active.child); } } };
}
