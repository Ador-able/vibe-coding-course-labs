import { ByteLevelDecoder, Tokenizer } from '@huggingface/tokenizers';
import manifest from '../public/tokenizers/manifest.json';

export const models = manifest.models;
export const presets = [
  { name: '中文', text: '今天我们用 AI 写一封邮件。' },
  { name: '英文', text: 'Hello, world!' },
  { name: '数字', text: '1234567890' },
  { name: '代码', text: 'const total = price * 2;' },
  { name: '生僻字与表情', text: '龘🙂' },
];

const cache = new Map<string, Promise<Tokenizer>>();

export function loadTokenizer(key: string): Promise<Tokenizer> {
  const existing = cache.get(key);
  if (existing) return existing;
  const model = models.find((item) => item.key === key);
  if (!model) throw new Error('没有找到所选分词器。');
  const loading = Promise.all(['tokenizer.json', 'tokenizer_config.json'].map(async (name) => {
    const response = await fetch(`/mechanics/tokenizers/${key}/${name}`);
    if (!response.ok) throw new Error('本地分词器文件读取失败，请重新安装课程项目。');
    return response.json() as Promise<object>;
  })).then(([definition, config]) => new Tokenizer(definition, config));
  cache.set(key, loading);
  loading.catch(() => cache.delete(key));
  return loading;
}

export function analyze(text: string, tokenizer: Tokenizer) {
  const encoded = tokenizer.encode(text, { add_special_tokens: false });
  // 库不接受空 ID 数组；空输入对应空输出。
  const decoded = encoded.ids.length
    ? tokenizer.decode(encoded.ids, { skip_special_tokens: false, clean_up_tokenization_spaces: false })
    : '';
  if (!(tokenizer.decoder instanceof ByteLevelDecoder)) throw new Error('本实验的字节观察只适用于这两份 ByteLevel 分词器。');
  const decoder = tokenizer.decoder;
  const added = tokenizer.get_added_tokens_decoder();
  const tokenDetails = encoded.tokens.map((token, index) => {
    const id = encoded.ids[index];
    const literal = added.get(id);
    // 字节映射由官方库提供；这里仅整理显示，不重新实现分词算法。
    const bytes = literal ? Array.from(new TextEncoder().encode(literal.content)) : Array.from(token, (character) => Number(decoder.byte_decoder[character]));
    if (bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) throw new Error('词表中出现了无法显示的字节映射。');
    return { index, id, rawToken: token, bytes, special: literal?.special ?? false, independentText: decodeCompleteBytes(bytes) };
  });
  const groups: { text: string; start: number; end: number; ids: number[] }[] = [];
  let pending: number[] = [];
  let start = 0;
  for (const token of tokenDetails) {
    pending.push(...token.bytes);
    const complete = decodeCompleteBytes(pending);
    if (complete !== null) {
      groups.push({ text: complete, start, end: token.index + 1, ids: encoded.ids.slice(start, token.index + 1) });
      start = token.index + 1;
      pending = [];
    }
  }
  if (pending.length) throw new Error('token 序列未组成完整的 UTF-8 文本。');
  return {
    input: text,
    count: encoded.ids.length,
    ids: encoded.ids,
    tokens: encoded.tokens,
    decoded,
    exactRoundTrip: decoded === text,
    normalizedInput: tokenizer.normalizer?.normalize(text) ?? text,
    tokenDetails,
    groups,
  };
}

function decodeCompleteBytes(bytes: number[]): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}
