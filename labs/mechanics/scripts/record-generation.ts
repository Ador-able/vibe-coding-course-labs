import { writeFile } from 'node:fs/promises';
import { chooseToken, createGeneration, getCandidates, getContext, highestProbability, initialContext, maxOutputTokens, type TeachingToken } from '../src/generation/model.ts';

const firstStep = getCandidates(createGeneration());
const afterDrink = (['豆浆', '咖啡', '茶'] as const).map((token) => {
  const state = chooseToken(createGeneration(), token, 'manual');
  return { context: getContext(state), candidates: getCandidates(state) };
});

let highestRoute = createGeneration();
while (highestRoute.stopReason === null) {
  highestRoute = chooseToken(highestRoute, highestProbability(getCandidates(highestRoute)).token, 'highest');
}

let lengthRoute = createGeneration();
const manualTokens: TeachingToken[] = ['咖啡', '，', '配面包', '，', '配包子', '，'];
for (const token of manualTokens) lengthRoute = chooseToken(lengthRoute, token, 'manual');

await writeFile(new URL('../evidence/生成实验结果.json', import.meta.url), JSON.stringify({
  scope: '人工词表、候选得分和转移规则；未运行模型推理。softmax 概率由项目实际计算。',
  initialContext,
  maxOutputTokens,
  firstStep,
  afterDrink,
  highestRoute: { ...highestRoute, text: getContext(highestRoute) },
  lengthRoute: { ...lengthRoute, text: getContext(lengthRoute) },
}, null, 2) + '\n');
