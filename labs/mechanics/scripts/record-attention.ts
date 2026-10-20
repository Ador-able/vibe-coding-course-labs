import { writeFile } from 'node:fs/promises';
import { calculateAttention, examplePositions } from '../src/attention/math.ts';

await writeFile(new URL('../evidence/注意力实验结果.json', import.meta.url), JSON.stringify({
  scope: '人工 Q、K、V，未运行模型；真实计算缩放点积、softmax、权重乘 V 及加权和。向量维度没有固定语义。',
  formula: 'softmax(Q K^T / sqrt(d_k)) V',
  baseline: calculateAttention([1, 0], examplePositions()),
  changedQuery: calculateAttention([0, 1], examplePositions()),
  changedValueOnly: calculateAttention([1, 0], examplePositions(true)),
  changedQueryAndValue: calculateAttention([0, 1], examplePositions(true)),
}, null, 2) + '\n');
