import { writeFile } from 'node:fs/promises';
import { initialCandidates, nucleusDistribution, sampleDistribution, seeds, temperatureDistribution, temperatures } from '../src/sampling/model.ts';

const distribution = nucleusDistribution(temperatureDistribution(1), 0.8);
await writeFile(new URL('../evidence/采样实验结果.json', import.meta.url), JSON.stringify({
  scope: '固定前缀“早餐喝”，人工logits，无训练、无真实模型推理；每次抽样重新面对同一分布，不生成连续100个token。',
  randomAlgorithm: '32位 LCG: state=(1664525*state+1013904223) mod 2^32; u=state/2^32',
  initialCandidates,
  temperatureComparison: temperatures.map((temperature) => ({ temperature, candidates: temperatureDistribution(temperature) })),
  topPComparison: temperatures.map((temperature) => ({ temperature, ...nucleusDistribution(temperatureDistribution(temperature), 0.8) })),
  sampleParameters: { temperature: 1, topP: 0.8, count: 100 },
  samples: seeds.map((seed) => sampleDistribution(distribution, seed)),
  repeatedSeed2026: sampleDistribution(distribution, 2026),
}, null, 2) + '\n');
