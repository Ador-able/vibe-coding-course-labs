import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';

const [chapter, script = 'lab', ...args] = process.argv.slice(2);
if (!/^chapter(?:03|05|07|08|09|10|12|13|14|15|16)$/.test(chapter || '')) {
  console.error('用法：pnpm lab chapter05 [本章命令] [参数...]。本章命令见实验页面。');
  process.exit(1);
}
const cwd = resolve(import.meta.dirname, '..', 'lessons', chapter, 'project');
const manifest = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
if (!Object.hasOwn(manifest.scripts, script)) { console.error(`本章没有 ${script} 命令，请查看本章说明。`); process.exit(1); }
let settings = {};
try { settings = JSON.parse(readFileSync(join(homedir(), '.vibe-coding-labs/model.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') { console.error('模型配置文件无法读取，请在实验页面重新保存。'); process.exit(1); } }
// pnpm 运行既有命令；用户参数不经过 shell 拼接。
const child = spawn(process.execPath, [process.env.npm_execpath, '--dir', cwd, 'run', script, ...args], {
  stdio: 'inherit', windowsHide: true,
  env: { ...process.env, ...(settings.apiKey ? { API_BASE_URL: settings.baseUrl, API_KEY: settings.apiKey, MODEL: settings.model, STRUCTURED_MODEL: settings.structuredModel || settings.model, EMBEDDING_MODEL: settings.embeddingModel || '' } : {}) },
});
child.on('error', error => { console.error(`实验未能启动：${error.message}`); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
