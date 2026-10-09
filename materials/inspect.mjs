import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const runDir = resolve(root, process.argv[2] ?? 'runs/comparison-01');
const material = JSON.parse(await readFile(join(root, 'inputs/materials.json'), 'utf8'));
const ids = new Set(['M01', ...material.chapters.flatMap(c => c.paragraphs.map(p => p.id))]);
const report = JSON.parse(await readFile(join(runDir, 'report.json'), 'utf8'));
const countHan = value => [...value.matchAll(/\p{Script=Han}/gu)].length;
const counts = report.calls.map(call => {
  let output, parseError;
  try { output = JSON.parse(call.result?.text ?? ''); } catch (error) { parseError = error.message; }
  const cited = output?.evidence?.flatMap(x => x.sourceIds ?? []) ?? [];
  const isMap = call.id.startsWith('02-map-');
  const range = isMap ? [200, 320] : [300, 450];
  const han = typeof output?.summary === 'string' ? countHan(output.summary) : null;
  return { id: call.id, parseError: parseError ?? null, han, range, lengthMeetsRequest: han !== null && han >= range[0] && han <= range[1], unresolvedCount: output?.unresolved?.length ?? null, invalidSourceIds: cited.filter(x => !ids.has(x)), finishReason: call.result?.finishReason, usage: call.result?.usage, observation: '仅格式、数量与编号存在性；内容关系另由人回查原段' };
});
const sums = {};
for (const method of report.methods) {
  const relevant = counts.filter(x => method.name === 'whole' ? x.id === '01-whole' : method.name === 'map-reduce' ? x.id.startsWith('02-map-') || x.id === '03-reduce' : x.id.startsWith('04-refine-'));
  const inputTokens = relevant.reduce((n, x) => n + (x.usage?.inputTokens ?? 0), 0);
  const outputTokens = relevant.reduce((n, x) => n + (x.usage?.outputTokens ?? 0), 0);
  sums[method.name] = { calls: relevant.length, elapsedMs: method.elapsedMs, inputTokens, outputTokens, priceEstimateCny: (inputTokens * 0.8 + outputTokens * 2) / 1000000, priceScope: '北京 qwen-plus-2025-12-01 输入不超过128K的非思考公开原价估算；未核账户账单，不证明实付或免费' };
}
const inspection = { requestCount: report.requestCount, counts, sums, contentPassed: null };
await writeFile(join(runDir, 'mechanical-inspection.json'), JSON.stringify(inspection, null, 2) + '\n');
console.log(JSON.stringify(inspection, null, 2));
