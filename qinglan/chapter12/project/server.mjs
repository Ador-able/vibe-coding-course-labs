import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSharedConfig } from './src/config.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.pdf': 'application/pdf' };
const server = http.createServer(async (request, response) => {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }); response.end('只读入口'); return;
    }
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/api/config') {
      let config;
      try { config = readSharedConfig(); } catch { config = {}; }
      response.writeHead(200, { 'Content-Type': types['.json'], 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ textReady: Boolean(config.apiKey && config.baseUrl && config.model), embeddingReady: Boolean(config.apiKey && config.baseUrl && config.embeddingModel), model: config.model || '', embeddingModel: config.embeddingModel || '', source: '请求观察室共用设置' })); return;
    }
    const filename = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (filename !== root && !filename.startsWith(root + path.sep)) { response.writeHead(404); response.end('没有此文件'); return; }
    const data = await fs.readFile(filename);
    response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(error.code === 'ENOENT' ? '这份记录尚未保存。' : '文件未能读回。');
  }
});
const port = Number(process.env.LAB_PORT || 4352);
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被使用，请为 LAB_PORT 指定另一端口。` : '实验服务启动失败。'); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`小说资料工作台：http://127.0.0.1:${port}`));
