import assert from 'node:assert/strict';
import test from 'node:test';
import { compareVectors, lookupEmbeddings } from '../src/vectors/math.ts';

function close(actual: number | null, expected: number) {
  assert.notEqual(actual, null);
  assert.ok(Math.abs(actual! - expected) < 1e-12, `${actual} 应接近 ${expected}`);
}

test('编号序列按顺序查表，重复编号保留重复的向量', () => {
  assert.deepEqual(lookupEmbeddings([2, 0, 2]), [
    [-0.6, 0.1, 0.9], [0.2, 0.8, -0.1], [-0.6, 0.1, 0.9],
  ]);
});

test('方向相同不等于距离为零，内积随长度变化', () => {
  const near = compareVectors([1, 1], [2, 2]);
  const far = compareVectors([1, 1], [3, 3]);
  close(near.cosine, 1);
  close(far.cosine, 1);
  assert.equal(near.dot, 4);
  assert.equal(far.dot, 6);
  close(near.distance, Math.sqrt(2));
  close(far.distance, Math.sqrt(8));
  close(far.lengthB, Math.sqrt(18));
});

test('垂直、反向和零向量各有明确结果', () => {
  const perpendicular = compareVectors([1, 1], [-1, 1]);
  assert.equal(perpendicular.cosine, 0);
  assert.equal(perpendicular.dot, 0);
  assert.equal(perpendicular.distance, 2);
  close(compareVectors([1, 1], [-1, -1]).cosine, -1);
  const zero = compareVectors([1, 1], [0, 0]);
  assert.equal(zero.cosine, null);
  assert.equal(zero.dot, 0);
  close(zero.distance, Math.sqrt(2));
  assert.equal(compareVectors([0, 0], [1, 1]).cosine, null);
  assert.equal(compareVectors([0, 0], [0, 0]).distance, 0);
});
