import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.pdf': 'application/pdf', '.png': 'image/png' };
const reply = (response, status, text) => { response.writeHead(status, { 'Content-Type': types['.txt'] }); response.end(text); };
const isRead = (request, response) => {
  if (['GET', 'HEAD'].includes(request.method)) return true;
  response.setHeader('Allow', 'GET, HEAD'); reply(response, 405, '只读入口'); return false;
};
const reader = http.createServer(async (request, response) => {
  if (!isRead(request, response)) return;
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/') { response.writeHead(302, { Location: '/flow.html' }); response.end(); return; }
    const mount = ['inputs', 'records', 'materials', 'files', 'workflows'].find(name => url.pathname.startsWith('/' + name + '/'));
    const base = path.join(root, mount || 'public');
    const relative = mount ? url.pathname.slice(mount.length + 1) : url.pathname;
    const filename = path.resolve(base, '.' + decodeURIComponent(relative));
    if (!filename.startsWith(base + path.sep)) { reply(response, 404, '没有此文件'); return; }
    const raw = await fs.readFile(filename);
    response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : raw);
  } catch (error) { reply(response, ['ENOENT', 'EISDIR'].includes(error.code) ? 404 : 500, '这份材料未能读回。'); }
});
const originals = new Map([
  ['/fanren-C05.pdf', { file: 'fanren-C05.pdf', type: 'application/pdf' }],
  ['/fanren-C05.txt', { file: 'fanren-C05.txt', type: 'text/plain; charset=utf-8' }],
]);
const fileServer = http.createServer(async (request, response) => {
  if (!isRead(request, response)) return;
  const entry = originals.get(new URL(request.url, 'http://localhost').pathname);
  if (!entry) { reply(response, 404, '没有此课堂原件'); return; }
  try {
    const raw = await fs.readFile(path.join(root, 'files', entry.file));
    response.writeHead(200, { 'Content-Type': entry.type, 'Content-Length': raw.length, 'Content-Disposition': 'inline; filename="' + entry.file + '"', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : raw);
    // 只记两份公开原件的实际读取，不保存认证头或任意路径。
    const event = { requestedAt: new Date().toISOString(), method: request.method, path: new URL(request.url, 'http://localhost').pathname, fileName: entry.file, mimeType: entry.type.split(';')[0], bytes: raw.length, sha256: createHash('sha256').update(raw).digest('hex'), userAgent: request.headers['user-agent'] || null, status: 200 };
    await fs.mkdir(path.join(root, '.local'), { recursive: true });
    await fs.appendFile(path.join(root, '.local/file-reads.jsonl'), JSON.stringify(event) + '\n');
  } catch { if (!response.headersSent) reply(response, 500, '课堂原件未能读回。'); }
});
const ports = [Number(process.env.LAB_PORT || 4360), Number(process.env.FILE_PORT || 4361)];
for (const server of [reader, fileServer]) server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? '实验端口已被占用，请指定新的 LAB_PORT 和 FILE_PORT。' : '实验服务启动失败。'); reader.close(); fileServer.close(); process.exitCode = 1; });
reader.listen(ports[0], '127.0.0.1', () => console.log('凡人业务工作台：http://127.0.0.1:' + ports[0]));
fileServer.listen(ports[1], '0.0.0.0', () => console.log('课堂 PDF/TXT 服务：http://localhost:' + ports[1]));
const close = () => { reader.close(); fileServer.close(); };
process.on('SIGTERM', close); process.on('SIGINT', close);
