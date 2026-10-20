import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { Tokenizer } from '@huggingface/tokenizers';
import { analyze, models, presets } from '../src/tokenization.ts';

const texts = [...presets.map((item) => item.text), '你好，世界！', 'hello', 'hello world', 'world', ' world', 'cafe\u0301', 'Hello\n  world\t!'];
const results = [];
for (const model of models) {
  const [definition, config] = await Promise.all(['tokenizer.json', 'tokenizer_config.json'].map(async (name) => JSON.parse(await readFile(new URL(`../public/tokenizers/${model.key}/${name}`, import.meta.url), 'utf8'))));
  const tokenizer = new Tokenizer(definition, config);
  for (const text of texts) results.push({ model: model.repository, revision: model.revision, ...analyze(text, tokenizer) });
}
await mkdir(new URL('../evidence/', import.meta.url), { recursive: true });
await writeFile(new URL('../evidence/实际分词结果.json', import.meta.url), JSON.stringify({ library: '@huggingface/tokenizers@0.2.0', add_special_tokens: false, clean_up_tokenization_spaces: false, results }, null, 2) + '\n');
console.log(`已记录 ${results.length} 组真实分词结果。`);
