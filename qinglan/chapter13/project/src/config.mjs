import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function readSharedConfig(required = false) {
  let config;
  try { config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.vibe-coding-labs/model.json'), 'utf8')); }
  catch { if (!required) return {}; throw new Error('请先在请求观察室的“模型设置”中保存共用配置。'); }
  if (required && !(config.baseUrl && config.apiKey && config.model)) throw new Error('请先在请求观察室的“模型设置”中保存共用配置。');
  return config;
}
