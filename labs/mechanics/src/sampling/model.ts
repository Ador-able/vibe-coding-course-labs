import { createGeneration, getCandidates, softmax, type Candidate } from '../generation/model';

export const temperatures = [0.5, 1, 2] as const;
export const topPs = [1, 0.8, 0.5] as const;
export const seeds = [2026, 2027] as const;
export const drawCount = 100;
export const initialCandidates = getCandidates(createGeneration()).map(({ token, logit }) => ({ token, logit }));

export function temperatureDistribution(temperature: typeof temperatures[number]): Candidate[] {
  const probabilities = softmax(initialCandidates.map(({ logit }) => logit / temperature));
  return initialCandidates.map((candidate, index) => ({ ...candidate, probability: probabilities[index] }));
}

export function nucleusDistribution(candidates: readonly Candidate[], topP: typeof topPs[number]) {
  const sorted = [...candidates].sort((left, right) => right.probability - left.probability);
  let cumulative = 0;
  let reached = false;
  const rows = sorted.map((candidate) => {
    // 先保留当前项，再判断是否达到阈值；p=1 保留全部浮点尾项。
    const retained = topP === 1 || !reached;
    cumulative += candidate.probability;
    if (cumulative >= topP) reached = true;
    return { ...candidate, cumulative, retained };
  });
  const retainedMass = rows.reduce((sum, row) => sum + (row.retained ? row.probability : 0), 0);
  return {
    topP,
    retainedMass,
    rows: rows.map((row) => ({ ...row, sampleProbability: row.retained ? row.probability / retainedMass : 0 })),
  };
}

export type NucleusDistribution = ReturnType<typeof nucleusDistribution>;

function seededRandom(seed: number) {
  let state = seed >>> 0;
  // 32位线性同余发生器：固定种子只用于重现本页的伪随机序列。
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function sampleDistribution(distribution: NucleusDistribution, seed: typeof seeds[number]) {
  const random = seededRandom(seed);
  const retained = distribution.rows.filter((row) => row.retained);
  const draws: Candidate['token'][] = [];
  for (let i = 0; i < drawCount; i++) {
    const value = random();
    let cumulative = 0;
    let selected = retained[retained.length - 1].token;
    for (const row of retained) {
      cumulative += row.sampleProbability;
      if (value < cumulative) {
        selected = row.token;
        break;
      }
    }
    draws.push(selected);
  }
  return {
    seed,
    drawCount,
    draws,
    rows: distribution.rows.map((row) => {
      const count = draws.filter((token) => token === row.token).length;
      return { token: row.token, theoreticalProbability: row.sampleProbability, count, frequency: count / drawCount };
    }),
  };
}
