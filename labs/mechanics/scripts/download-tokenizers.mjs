import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const models = [
  { key: 'qwen3', name: 'Qwen3-0.6B', repository: 'Qwen/Qwen3-0.6B', revision: 'c1899de289a04d12100db370d81485cdf75e47ca', license: 'Apache-2.0', files: ['tokenizer.json', 'tokenizer_config.json', 'LICENSE'] },
  { key: 'deepseek-v3', name: 'DeepSeek-V3', repository: 'deepseek-ai/DeepSeek-V3', revision: 'e815299b0bcbac849fa540c768ef21845365c9eb', license: 'DeepSeek Model License；代码许可为 MIT', files: ['tokenizer.json', 'tokenizer_config.json', 'LICENSE-MODEL', 'LICENSE-CODE'] },
];

for (const model of models) {
  const folder = new URL(`../public/tokenizers/${model.key}/`, import.meta.url);
  await mkdir(folder, { recursive: true });
  const files = [];
  for (const name of model.files) {
    const url = `https://huggingface.co/${model.repository}/resolve/${model.revision}/${name}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${model.name}/${name}: HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    await writeFile(new URL(name, folder), bytes);
    files.push({ name, url, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  model.files = files;
}
const output = new URL('../public/tokenizers/manifest.json', import.meta.url);
await writeFile(output, JSON.stringify({ downloadedAt: new Date().toISOString(), models }, null, 2) + '\n');
console.log(fileURLToPath(output));
console.log(JSON.stringify(models.map(({ name, revision, files }) => ({ name, revision, files })), null, 2));
