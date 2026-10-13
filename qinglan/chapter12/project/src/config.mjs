import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function readSharedConfig(required) {
  const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.vibe-coding-labs', 'model.json'), 'utf8'));
  if (required && (!config.baseUrl || !config.apiKey || !config[required === 'embedding' ? 'embeddingModel' : 'model'])) throw new Error('请在请求观察室的“模型设置”中保存本次实验所需配置。');
  return config;
}
