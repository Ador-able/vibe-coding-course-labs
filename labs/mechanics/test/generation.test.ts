import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseToken, createGeneration, getCandidates, getContext, highestProbability, maxOutputTokens, softmax, type TeachingToken } from '../src/generation/model.ts';

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} 应接近 ${expected}`);

test('softmax 归一化且加上较大公共常数后结果不变', () => {
  const expected = [0.6652409557748218, 0.24472847105479764, 0.09003057317038046];
  const probabilities = softmax([2, 1, 0]);
  probabilities.forEach((probability, index) => close(probability, expected[index]));
  close(probabilities.reduce((sum, value) => sum + value, 0), 1);
  softmax([1002, 1001, 1000]).forEach((probability, index) => close(probability, expected[index]));
  assert.deepEqual(softmax([1, 1]), [0.5, 0.5]);
  assert.deepEqual(softmax([1000, -1000]), [1, 0]);
});

test('选出的 token 加入上下文，后续候选随此前选择而变化', () => {
  const original = createGeneration();
  const soy = chooseToken(original, '豆浆', 'highest');
  const coffee = chooseToken(original, '咖啡', 'manual');
  assert.equal(getContext(soy), '早餐喝豆浆');
  assert.equal(getContext(coffee), '早餐喝咖啡');
  assert.equal(original.records.length, 0);
  assert.equal(highestProbability(getCandidates(soy)).token, '。');
  assert.equal(highestProbability(getCandidates(coffee)).token, '，');
  const soyComma = chooseToken(soy, '，', 'manual');
  const coffeeComma = chooseToken(coffee, '，', 'highest');
  assert.equal(highestProbability(getCandidates(soyComma)).token, '配包子');
  assert.equal(highestProbability(getCandidates(coffeeComma)).token, '配面包');
  assert.equal(soyComma.records[1].context, '早餐喝豆浆');
  assert.deepEqual(soyComma.records[1].candidates, getCandidates(soy));
  assert.throws(() => chooseToken(soy, '咖啡', 'manual'), /不在当前候选/);
});

test('EOS 停止与固定长度截断不同，停止后不能追加 token', () => {
  let ended = createGeneration();
  while (ended.stopReason === null) ended = chooseToken(ended, highestProbability(getCandidates(ended)).token, 'highest');
  assert.equal(ended.stopReason, 'eos');
  assert.deepEqual(ended.records.map((record) => record.selected), ['豆浆', '。', '<EOS>']);
  assert.equal(getContext(ended), '早餐喝豆浆。');
  assert.deepEqual(getCandidates(ended), []);
  assert.throws(() => chooseToken(ended, '。', 'manual'), /已经停止/);

  let limited = createGeneration();
  const route: TeachingToken[] = ['咖啡', '，', '配面包', '，', '配包子', '，'];
  for (const token of route) limited = chooseToken(limited, token, 'manual');
  assert.equal(limited.stopReason, 'limit');
  assert.equal(limited.records.length, maxOutputTokens);
  assert.equal(getContext(limited), '早餐喝咖啡，配面包，配包子，');
  assert.deepEqual(getCandidates(limited), []);
  assert.throws(() => chooseToken(limited, '配面包', 'manual'), /已经停止/);
});
