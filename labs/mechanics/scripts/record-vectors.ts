import { writeFile } from 'node:fs/promises';
import { compareVectors, embeddingTable, lookupEmbeddings, type Vector2 } from '../src/vectors/math.ts';

const a: Vector2 = [1, 1];
const comparisons: Vector2[] = [[2, 2], [3, 3], [-1, 1], [-1, -1], [0, 0], [1, 1]];

await writeFile(new URL('../evidence/向量实验结果.json', import.meta.url), JSON.stringify({
  scope: '人工数值实验，不来自模型；结果直接由项目计算函数生成。',
  embeddingTable,
  tokenIds: [2, 0, 2],
  lookup: lookupEmbeddings([2, 0, 2]),
  comparisons: comparisons.map((b) => ({ a, b, ...compareVectors(a, b) })),
}, null, 2) + '\n');
