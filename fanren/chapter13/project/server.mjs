import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { root } from './src/files.mjs';
import { readSharedConfig } from './src/config.mjs';

const publicRoot = path.join(root, 'public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.csv': 'text/plain; charset=utf-8' };
const server = http.createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end('只读入口'); return; }
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/api/config') {
      const config = readSharedConfig(); response.writeHead(200, { 'Content-Type': types['.json'], 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ ready: Boolean(config.baseUrl && config.apiKey && config.model), model: config.model || '', source: '请求观察室共用设置' })); return;
    }
    const recordPath = url.pathname.startsWith('/records/');
    const base = recordPath ? path.join(root, 'records') : publicRoot;
    const relative = recordPath ? url.pathname.slice('/records'.length) : url.pathname === '/' ? '/index.html' : url.pathname;
    const filename = path.resolve(base, '.' + decodeURIComponent(relative));
    if (!filename.startsWith(base + path.sep)) { response.writeHead(404); response.end('没有此文件'); return; }
    const data = await fs.readFile(filename);
    response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(request.method === 'HEAD' ? undefined : data);
  } catch (error) { response.writeHead(['ENOENT', 'EISDIR'].includes(error.code) ? 404 : 500, { 'Content-Type': types['.txt'] }); response.end(error.code === 'ENOENT' ? '这份课堂记录尚未保存。' : '文件未能读回。'); }
});
const port = Number(process.env.LAB_PORT || 4355);
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被使用，请为 LAB_PORT 指定另一端口。` : '实验服务启动失败。'); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`小说整理工作台：http://127.0.0.1:${port}`));
