import express from 'express';
import { readFile, mkdir, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { marked } from 'marked';
import { createApp } from '../labs/requests/src/server.ts';
import { createMessageHistoryRouter } from '../labs/requests/src/message-history/routes.ts';
import { createRequestsRouter } from '../labs/requests/src/requests/routes.ts';
import { groups } from '../shared/catalog.ts';
import { createLessonRuns } from './lesson-runs.ts';

const root = resolve(import.meta.dirname, '..');

function guidePage(title: string, content: string) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="/layout.css"><link rel="stylesheet" href="/course.css"><script src="/navigation.js" defer></script></head><body><main>${content}</main></body></html>`;
}

export async function createCourseApp(configPath?: string, dataDirectory = join(root, '.data')) {
  const disclosureProject = join(root, 'lessons/chapter03/project');
  const taskProject = join(root, 'lessons/chapter04/project');
  const app = createApp(undefined, console.log, configPath, {
    disclosure: { projectDirectory: disclosureProject, recordDirectory: join(dataDirectory, 'disclosure/novel') },
    tasks: { projectDirectory: taskProject, recordDirectory: join(dataDirectory, 'tasks') },
    tools: { projectDirectory: join(root, 'lessons/chapter05/tools'), recordDirectory: join(dataDirectory, 'tools') },
    toolResults: { projectDirectory: join(root, 'lessons/chapter05/tool-results'), recordDirectory: join(dataDirectory, 'tool-results') },
    control: { projectDirectory: join(root, 'lessons/chapter05/control'), recordDirectory: join(dataDirectory, 'control') },
  });
  const messages = await createMessageHistoryRouter(dataDirectory);
  const requests = await createRequestsRouter(join(dataDirectory, 'requests'));
  const lessons = createLessonRuns(root);
  app.use('/api/lesson-runs', lessons.router);
  app.use('/api/messages', messages.router);
  app.use('/api/requests', requests.router);
  app.use('/mechanics', express.static(join(root, 'labs/mechanics/dist')));
  app.use('/requests', express.static(join(root, 'labs/requests/dist')));
  app.use('/lessons/materials', express.static(join(root, 'lessons/materials')));
  app.use('/requests/memory/maintenance', express.static(join(disclosureProject, '自动记忆练习')));

  // 各章工作台与资料共用服务。
  for (const [url, title] of groups.flatMap(group => group.items).filter(([url]) => /^\/lessons\/chapter\d{2}\/$/.test(url))) {
    const chapter = url.split('/')[2];
    const project = join(root, 'lessons', chapter, 'project');
    if (['chapter12', 'chapter13', 'chapter14'].includes(chapter)) {
      if (chapter === 'chapter14') app.get(url, (_req, res) => res.redirect(`${url}flow.html`));
      app.use(url, express.static(join(project, 'public')));
      for (const directory of ['records', 'inputs', 'materials', 'files', 'workflows']) {
        app.use(encodeURI(`${url}${directory}`), express.static(join(project, directory)));
      }
    } else if (['chapter15', 'chapter16'].includes(chapter)) {
      app.get(url, (_req, res) => res.redirect(`${url}materials/viewer.html`));
      for (const directory of ['records', 'inputs', 'materials']) app.use(encodeURI(`${url}${directory}`), express.static(join(project, directory)));
    } else {
      app.get(url, async (_req, res, next) => {
        try {
          const markdown = await readFile(join(project, 'README.md'), 'utf8');
          const links = (html: string) => html.replace(/href="([^"#]+)"/g, (match, href: string) => {
            if (/^(?:[a-z]+:|\/)/i.test(href)) return match;
            const path = new URL(href, `http://course/lessons/${chapter}/project/`).pathname.replace(`/lessons/${chapter}/project/`, url);
            return `href="${path}"`;
          });
          const html = links(await marked.parse(markdown));
          const introduction = links(await marked.parse(markdown.split(/\r?\n\s*\r?\n/)[1] || ''));
          res.type('html').send(guidePage(title, `<h1>${title}</h1>${introduction}<details class="lesson-code"><summary>代码与操作说明</summary>${html}</details>`));
        } catch (error) { next(error); }
      });
      app.get(`${url}:file`, (req, res, next) => {
        if (!/^[^/]+\.(html|md)$/.test(req.params.file)) { next(); return; }
        res.sendFile(req.params.file, { root: project });
      });
      for (const directory of ['materials', '课堂记录', '运行记录', '自动记忆练习', 'evaluation', 'clarification', 'handoff']) {
        app.use(encodeURI(`${url}${directory}`), express.static(join(project, directory)));
      }
    }
  }
  for (const [name, title] of [['typescript', 'TypeScript 与项目运行'], ['recovery', '代码、会话与数据恢复']]) {
    const directory = join(root, 'lessons/references', name);
    app.get(`/references/${name}/`, async (_req, res, next) => {
      try { res.type('html').send(guidePage(title, await marked.parse(await readFile(join(directory, 'README.md'), 'utf8')))); }
      catch (error) { next(error); }
    });
    app.use(`/references/${name}`, express.static(directory));
  }
  app.use('/references/delivery', express.static(join(root, 'lessons/references/delivery')));
  // 原件读取仍记录实际字节与哈希，和课堂实录分开保存。
  const originals = express.Router();
  originals.get('/:file', async (req, res, next) => {
    if (!['fanren-C05.pdf', 'fanren-C05.txt'].includes(req.params.file)) { res.sendStatus(404); return; }
    try {
      const bytes = await readFile(join(root, 'lessons/chapter14/project/files', req.params.file));
      res.type(req.params.file.endsWith('.pdf') ? 'pdf' : 'text').send(bytes);
      const directory = join(dataDirectory, 'file-reads');
      await mkdir(directory, { recursive: true });
      await appendFile(join(directory, 'reads.jsonl'), JSON.stringify({ requestedAt: new Date().toISOString(), method: req.method, path: req.path, fileName: req.params.file, mimeType: req.params.file.endsWith('.pdf') ? 'application/pdf' : 'text/plain', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), userAgent: req.headers['user-agent'] || null, status: 200 }) + '\n');
    } catch (error) { next(error); }
  });
  app.use('/originals', originals);
  app.get('/course.css', (_req, res) => res.sendFile('style.css', { root: join(root, 'web') }));
  app.use(express.static(join(root, 'dist/home')));
  app.use((_req, res) => res.status(404).type('text').send('没有找到这个实验入口。'));
  app.use((error: NodeJS.ErrnoException, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (!res.headersSent) res.status(error.code === 'ENOENT' ? 404 : 500).type('text').send('实验资料未能读回，请检查文件是否完整。');
  });
  // Docker 中的文件提取流程只访问公开原件，不暴露模型设置与其他接口。
  const fileApp = express().disable('x-powered-by').use(originals);
  return { app, fileApp, close: async () => { lessons.close(); requests.close(); messages.close(); await app.closeTools(); } };
}

export async function startCourseServer() {
  const course = await createCourseApp();
  const port = Number(process.env.LAB_PORT || 4318);
  const server = course.app.listen(port, '127.0.0.1', () => console.log(`课程实验：http://127.0.0.1:${port}\n保留本窗口，按 Ctrl+C 停止。`));
  const files = course.fileApp.listen(Number(process.env.FILE_PORT || 4361), '0.0.0.0');
  let stopping = false;
  const stop = () => {
    if (stopping) return; stopping = true;
    Promise.all([server, files].map(listener => new Promise<void>(done => { listener.closeAllConnections(); listener.close(() => done()); }))).then(course.close);
  };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  for (const listener of [server, files]) listener.on('error', (error: NodeJS.ErrnoException) => {
    stop();
    console.error(error.code === 'EADDRINUSE' ? '实验端口已被占用，请关闭重复的实验窗口。' : `实验启动失败：${error.message}`);
    process.exitCode = 1;
  });
}

