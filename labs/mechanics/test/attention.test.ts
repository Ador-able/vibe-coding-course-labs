import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateAttention, examplePositions } from '../src/attention/math.ts';

function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} 应接近 ${expected}`);
}

test('基准注意力按缩放得分分配权重，并逐维汇总 V', () => {
  const result = calculateAttention([1, 0], examplePositions());
  assert.deepEqual(result.rows.map((row) => row.score), [2, 0, -2]);
  close(result.rows[0].scaledScore, Math.SQRT2);
  const expected = [0.7679179361387025, 0.18669370094750284, 0.04538836291379466];
  result.rows.forEach((row, index) => close(row.weight, expected[index]));
  close(result.rows.reduce((sum, row) => sum + row.weight, 0), 1);
  close(result.output[0], 0.8133062990524972);
  close(result.output[1], 0.2320820638612975);
});

test('仅切换 Q 改变权重分配与输出，K 和 V 不变', () => {
  const positions = examplePositions();
  const result = calculateAttention([0, 1], positions);
  assert.deepEqual(result.rows.map((row) => row.score), [0, 2, 0]);
  close(result.rows[0].weight, 0.16357910081201152);
  close(result.rows[1].weight, 0.672841798375977);
  close(result.rows[2].weight, 0.16357910081201152);
  close(result.output[0], 0.32715820162402304);
  close(result.output[1], 0.8364208991879886);
  assert.deepEqual(positions, examplePositions());
});

test('仅修改 C 的 V，得分与权重不变，输出按 C 的贡献改变', () => {
  const base = calculateAttention([1, 0], examplePositions());
  const changed = calculateAttention([1, 0], examplePositions(true));
  assert.deepEqual(changed.rows.map((row) => [row.score, row.scaledScore, row.weight]), base.rows.map((row) => [row.score, row.scaledScore, row.weight]));
  assert.deepEqual(changed.rows.slice(0, 2).map((row) => row.contribution), base.rows.slice(0, 2).map((row) => row.contribution));
  close(changed.output[0], 0.9040830248800865);
  close(changed.output[0] - base.output[0], 2 * base.rows[2].weight);
  assert.equal(changed.output[1], base.output[1]);
});
