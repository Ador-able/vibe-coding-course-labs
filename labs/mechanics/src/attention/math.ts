import { softmax } from '../generation/model';

export type Vector2 = readonly [number, number];
export interface AttentionPosition {
  name: string;
  key: Vector2;
  value: Vector2;
}

// 三个位置和所有向量均为人工数据，维度没有指定语义。
export function examplePositions(changeValueC = false): AttentionPosition[] {
  return [
    { name: 'A', key: [2, 0], value: [1, 0] },
    { name: 'B', key: [0, 2], value: [0, 1] },
    { name: 'C', key: [-2, 0], value: changeValueC ? [3, 1] : [1, 1] },
  ];
}

export function calculateAttention(query: Vector2, positions: readonly AttentionPosition[]) {
  const keyDimension = query.length;
  const divisor = Math.sqrt(keyDimension);
  const scores = positions.map(({ key }) => query[0] * key[0] + query[1] * key[1]);
  const scaledScores = scores.map((score) => score / divisor);
  const weights = softmax(scaledScores);
  const rows = positions.map((position, index) => ({
    ...position,
    score: scores[index],
    scaledScore: scaledScores[index],
    weight: weights[index],
    contribution: position.value.map((value) => value * weights[index]) as [number, number],
  }));
  const output: [number, number] = [0, 0];
  for (const row of rows) {
    output[0] += row.contribution[0];
    output[1] += row.contribution[1];
  }
  return { query, keyDimension, divisor, rows, output };
}
