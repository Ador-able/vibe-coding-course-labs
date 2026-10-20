export type Vector2 = readonly [number, number];

// 零向量没有方向，因此余弦相似度没有定义。
export function compareVectors(a: Vector2, b: Vector2) {
  const lengthA = Math.hypot(...a);
  const lengthB = Math.hypot(...b);
  const dot = a[0] * b[0] + a[1] * b[1];
  return {
    lengthA,
    lengthB,
    dot,
    distance: Math.hypot(a[0] - b[0], a[1] - b[1]),
    cosine: lengthA === 0 || lengthB === 0
      ? null
      : Math.max(-1, Math.min(1, dot / (lengthA * lengthB))),
  };
}

// 为观察查表过程手工指定的数字，不来自任何模型。
export const embeddingTable = [
  [0.2, 0.8, -0.1],
  [0.3, 0.7, 0],
  [-0.6, 0.1, 0.9],
] as const;

export type ExampleTokenId = 0 | 1 | 2;

export function lookupEmbeddings(ids: readonly ExampleTokenId[]) {
  return ids.map((id) => embeddingTable[id]);
}
