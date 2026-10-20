import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Tokenizer } from '@huggingface/tokenizers';
import { analyze, models } from '../src/tokenization.ts';
import reference from './reference.json';

for (const model of models) {
  test(`${model.name} 的编码和完整解码与独立 Rust 样本一致`, async () => {
    const config = await Promise.all(['tokenizer.json', 'tokenizer_config.json'].map(async (name) => JSON.parse(await readFile(new URL(`../public/tokenizers/${model.key}/${name}`, import.meta.url), 'utf8'))));
    const tokenizer = new Tokenizer(config[0], config[1]);
    for (const sample of reference.cases.filter((item) => item.model === model.key)) {
      const actual = analyze(sample.text, tokenizer);
      assert.deepEqual(actual.ids, sample.ids, sample.text);
      assert.deepEqual(actual.tokens, sample.tokens, sample.text);
      assert.equal(actual.decoded, sample.decoded, sample.text);
      assert.equal(actual.groups.map((group) => group.text).join(''), actual.decoded);
      assert.deepEqual(actual.groups.flatMap((group) => group.ids), actual.ids);
      assert.ok(actual.tokenDetails.every((token) => token.bytes.every((byte) => Number.isInteger(byte))));
      if (sample.text === '龘🙂') {
        assert.ok(actual.tokenDetails.some((item) => item.independentText === null));
        assert.deepEqual(actual.groups.map((group) => group.text), ['龘', '🙂']);
        assert.deepEqual(actual.tokenDetails.flatMap((token) => token.bytes), [0xE9, 0xBE, 0x98, 0xF0, 0x9F, 0x99, 0x82]);
      }
      if (sample.text === 'cafe\u0301') assert.equal(actual.exactRoundTrip, model.key !== 'qwen3');
    }
  });
}

test('课程配置字节与下载清单的 SHA256 一致', async () => {
  for (const model of models) {
    for (const file of model.files) {
      const bytes = await readFile(new URL(`../public/tokenizers/${model.key}/${file.name}`, import.meta.url));
      assert.equal(bytes.length, file.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    }
  }
});
