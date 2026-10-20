import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleInput = fileURLToPath(new URL('../inputs/有效草稿.json', import.meta.url));
const cwdInput = resolve('inputs/有效草稿.json');
const exists = async (file: string) => { try { await access(file); return true; } catch { return false; } };
console.log(JSON.stringify({
  node: process.version,
  platform: process.platform,
  cwd: process.cwd(),
  moduleDirectory: fileURLToPath(new URL('./', import.meta.url)),
  cwdInput: { file: cwdInput, exists: await exists(cwdInput) },
  moduleInput: { file: moduleInput, exists: await exists(moduleInput) },
  demoMessage: process.env.VCR01_DEMO_MESSAGE ?? '未设置',
}, null, 2));
