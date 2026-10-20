export const initialContext = '早餐喝';
export const maxOutputTokens = 6;
export const eosToken = '<EOS>';

export type TeachingToken = '豆浆' | '咖啡' | '茶' | '，' | '。' | '配包子' | '配面包' | typeof eosToken;
export type ChoiceMode = 'highest' | 'manual';
export type StopReason = 'eos' | 'limit' | null;
export interface Candidate { token: TeachingToken; logit: number; probability: number }
export interface StepRecord {
  context: string;
  candidates: Candidate[];
  selected: TeachingToken;
  mode: ChoiceMode;
}
export interface GenerationState { records: StepRecord[]; stopReason: StopReason }

// 减去最大值不改变 softmax 结果，可避免较大得分取指数时溢出。
export function softmax(logits: readonly number[]): number[] {
  const maximum = Math.max(...logits);
  const exponentials = logits.map((value) => Math.exp(value - maximum));
  const sum = exponentials.reduce((total, value) => total + value, 0);
  return exponentials.map((value) => value / sum);
}

export function createGeneration(): GenerationState {
  return { records: [], stopReason: null };
}

export function getContext(state: GenerationState): string {
  return initialContext + state.records.map((record) => record.selected === eosToken ? '' : record.selected).join('');
}

export function getCandidates(state: GenerationState): Candidate[] {
  if (state.stopReason !== null) return [];
  const previous = state.records.at(-1)?.selected;
  const drink = state.records[0]?.selected;
  let scores: [TeachingToken, number][];

  // 这些分支与得分均由人编写，只演示上下文改变后候选分布也会改变。
  if (previous === undefined) {
    scores = [['豆浆', 2], ['咖啡', 1], ['茶', 0]];
  } else if (previous === '。') {
    scores = [[eosToken, 0]];
  } else if (previous === '，') {
    scores = [['配包子', drink === '豆浆' ? 2 : 1], ['配面包', drink === '咖啡' ? 2 : 1]];
  } else if (previous === '豆浆' || previous === '咖啡' || previous === '茶') {
    scores = [['，', drink === '咖啡' ? 2 : 1], ['。', drink === '豆浆' ? 2 : 1]];
  } else {
    scores = [['，', 0], ['。', 2]];
  }

  const probabilities = softmax(scores.map(([, logit]) => logit));
  return scores.map(([token, logit], index) => ({ token, logit, probability: probabilities[index] }));
}

export function highestProbability(candidates: readonly Candidate[]): Candidate {
  // 得分相同时保留表中靠前的一项，不进行随机采样。
  return candidates.reduce((best, current) => current.probability > best.probability ? current : best);
}

export function chooseToken(state: GenerationState, token: TeachingToken, mode: ChoiceMode): GenerationState {
  if (state.stopReason !== null) throw new Error('本次生成已经停止，请先重来。');
  const candidates = getCandidates(state);
  if (!candidates.some((candidate) => candidate.token === token)) throw new Error('所选 token 不在当前候选中。');
  const records = [...state.records, { context: getContext(state), candidates, selected: token, mode }];
  return {
    records,
    // 同一步若选到 EOS，停止原因记录为 EOS，而不是长度上限。
    stopReason: token === eosToken ? 'eos' : records.length >= maxOutputTokens ? 'limit' : null,
  };
}
