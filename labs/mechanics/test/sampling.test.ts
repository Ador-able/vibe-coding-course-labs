import assert from 'node:assert/strict';
import test from 'node:test';
import { nucleusDistribution, sampleDistribution, temperatureDistribution, temperatures } from '../src/sampling/model.ts';

test('温度改变概率集中程度，每个分布均归一化且保留候选顺序', () => {
  const results = temperatures.map(temperatureDistribution);
  assert.ok(results[0][0].probability > results[1][0].probability);
  assert.ok(results[1][0].probability > results[2][0].probability);
  for (const rows of results) {
    assert.deepEqual(rows.map((row) => row.token), ['豆浆', '咖啡', '茶']);
    assert.ok(Math.abs(rows.reduce((sum, row) => sum + row.probability, 0) - 1) < 1e-12);
  }
});

test('top-p 先排序再保留达到阈值的最小前缀，跨界项不被排除', () => {
  const input = temperatureDistribution(1).reverse();
  const result = nucleusDistribution(input, 0.8);
  assert.deepEqual(result.rows.map((row) => row.token), ['豆浆', '咖啡', '茶']);
  assert.ok(result.rows[0].cumulative < 0.8);
  assert.ok(result.rows[1].cumulative > 0.8);
  assert.deepEqual(result.rows.map((row) => row.retained), [true, true, false]);
  assert.ok(Math.abs(result.rows[0].sampleProbability - 0.7310585786300049) < 1e-12);
  assert.ok(Math.abs(result.rows.reduce((sum, row) => sum + row.sampleProbability, 0) - 1) < 1e-12);
  assert.equal(result.rows[2].sampleProbability, 0);
  const exactThreshold = nucleusDistribution([
    { token: '茶', logit: 0, probability: 0.2 },
    { token: '豆浆', logit: 0, probability: 0.5 },
    { token: '咖啡', logit: 0, probability: 0.3 },
  ], 0.8);
  assert.deepEqual(exactThreshold.rows.map((row) => row.retained), [true, true, false]);
  assert.deepEqual(nucleusDistribution(temperatureDistribution(0.5), 0.8).rows.map((row) => row.retained), [true, false, false]);
});

test('top-p=1 保留所有候选，不因浮点累计到1提前删除尾项', () => {
  const result = nucleusDistribution([
    { token: '豆浆', logit: 0, probability: 0.7 },
    { token: '咖啡', logit: 0, probability: 0.30000000000000004 },
    { token: '茶', logit: 0, probability: 1e-17 },
  ], 1);
  assert.equal(result.rows[1].cumulative, 1);
  assert.ok(result.rows.every((row) => row.retained));
  assert.ok(result.rows[2].sampleProbability > 0);
});

test('100次真实本地抽样可按种子复现，排除项不会被抽中', () => {
  const distribution = nucleusDistribution(temperatureDistribution(1), 0.8);
  const first = sampleDistribution(distribution, 2026);
  const repeat = sampleDistribution(distribution, 2026);
  const secondSeed = sampleDistribution(distribution, 2027);
  assert.deepEqual(first, repeat);
  assert.notDeepEqual(first.draws, secondSeed.draws);
  assert.equal(first.draws.length, 100);
  assert.equal(first.rows.reduce((sum, row) => sum + row.count, 0), 100);
  assert.ok(first.draws.every((token) => token !== '茶'));
  assert.equal(first.rows.find((row) => row.token === '茶')!.count, 0);
  assert.equal(sampleDistribution(nucleusDistribution(temperatureDistribution(1), 0.5), 2026).rows[0].count, 100);
});
