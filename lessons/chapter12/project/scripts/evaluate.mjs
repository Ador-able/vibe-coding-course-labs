import path from 'node:path';
import { root, readJson, writeJson } from '../src/materials.mjs';
import { checkTeaching } from '../src/frozen.mjs';

checkTeaching();
const cards = readJson(path.join(root, 'inputs/评估题卡与判据.json'));
const retrieval = readJson(path.join(root, 'public/records/retrieval.json'));
const metrics = [];
for (const card of cards.cases.filter(card => card.conditions)) {
  for (const condition of card.conditions) {
    const selected = retrieval.cases.find(row => row.id === condition);
    const candidates = selected.fusion.top.slice(0, 2).map(row => ({ id: row.id, docId: row.document.docId }));
    const relevant = new Set(card.relevantBlockIds);
    const correct = candidates.filter(row => relevant.has(row.id));
    const first = candidates.findIndex(row => relevant.has(row.id));
    metrics.push({ caseId: card.id, condition, candidates, relevantBlockIds: card.relevantBlockIds,
      precisionAt2: correct.length / 2, recallAt2: new Set(correct.map(row => row.id)).size / relevant.size, reciprocalRankAt2: first < 0 ? 0 : 1 / (first + 1) });
  }
}
const report = { calculatedAt: new Date().toISOString(), sourceRetrievalRunId: retrieval.runId, metrics, modelJudgeCalls: 0, newModelCalls: 0,
  scope: '仅对冻结相关资料ID和实际候选名次做本地算术；未运行教师迁移题，不自动判断回答事实支持。' };
writeJson(path.join(root, 'public/records/evaluation.json'), report);
console.log(JSON.stringify({ rows: metrics.length, modelCalls: 0 }));
