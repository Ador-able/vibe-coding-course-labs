import assert from 'node:assert/strict';
import { create, insert, search } from '@orama/orama';
import { createTokenizer } from '@orama/tokenizers/mandarin';
import { cosineSimilarity } from 'ai';
import { matchesWhere, oramaWhere, byId } from './materials.mjs';

export function reciprocalRankFusion(lexical, semantic, k) {
  const union = new Map();
  for (const [name, list] of [['lexical', lexical], ['semantic', semantic]]) {
    list.forEach((hit, index) => {
      if (!union.has(hit.id)) union.set(hit.id, { id: hit.id, document: hit.document, score: 0,
        contributions: { lexical: { rank: null, contribution: 0 }, semantic: { rank: null, contribution: 0 } } });
      const row = union.get(hit.id), rank = index + 1, contribution = 1 / (k + rank);
      row.contributions[name] = { rank, contribution }; row.score += contribution;
    });
  }
  return [...union.values()].sort((a, b) => b.score - a.score || byId(a, b));
}
export async function rankMaterial(material, embedded) {
  const { corpus, queries, settings } = material, vectors = new Map(embedded.map(x => [x.id, x.embedding]));
  const tokenizer = createTokenizer();
  const db = create({ schema: { id: 'string', text: 'string', collection: 'enum', version: 'enum', projectCode: 'enum' },
    components: { tokenizer } });
  // 成熟组件的插入和检索契约可以返回Promise；按接口等待实际结果。
  for (const doc of corpus) await insert(db, { id: doc.id, text: doc.text, collection: doc.collection, version: doc.version, projectCode: doc.projectCode });
  const sourceById = new Map(corpus.map(x => [x.id, x]));
  const corpusTokens = corpus.map(x => ({ id: x.id, tokens: tokenizer.tokenize(x.text, undefined, 'text') }));
  const cases = [];
  for (const query of queries) {
    for (const [condition, where] of [['base', query.where], ['filtered', query.filterVariant]]) {
      const eligible = corpus.filter(x => matchesWhere(x, where)), apiWhere = oramaWhere(where);
      const params = { term: query.keywords, properties: settings.lexical.properties, exact: settings.lexical.exact,
        tolerance: settings.lexical.tolerance, threshold: settings.lexical.threshold,
        relevance: settings.lexical.relevance, where: apiWhere, limit: settings.lexical.limit };
      const top = await search(db, params), full = await search(db, { ...params, limit: corpus.length });
      assert.deepEqual(top.hits, full.hits.slice(0, settings.lexical.limit));
      const lexicalAll = full.hits.map(x => ({ id: x.id, score: x.score, document: sourceById.get(x.id) }));
      const lexical = lexicalAll.slice(0, settings.lexical.limit);
      const scoresById = new Map(lexicalAll.map(x => [x.id, x.score]));
      const semanticAll = eligible.map(x => ({ id: x.id, document: x,
        score: cosineSimilarity(vectors.get(query.id), vectors.get(x.id)) }))
        .sort((a, b) => b.score - a.score || byId(a, b));
      assert(semanticAll.every(x => Number.isFinite(x.score)), '余弦必须为有限值');
      const semantic = semanticAll.slice(0, settings.semantic.limit);
      const fused = reciprocalRankFusion(lexical, semantic, settings.fusion.k);
      cases.push({ id: query.id + '-' + condition, queryId: query.id, condition, question: query.question,
        keywords: query.keywords, semanticQuery: query.semanticQuery, judge: query.judge, where,
        eligibleIds: eligible.map(x => x.id), eligibleDocuments: eligible,
        lexical: { tokens: tokenizer.tokenize(query.keywords, undefined, 'text'), params,
          count: full.count, apiTopResult: top, apiFullResult: full, allHits: lexicalAll,
          allEligibleScores: eligible.map(x => ({ id: x.id, score: scoresById.get(x.id) ?? null, document: x })), top: lexical },
        semantic: { measure: 'AI SDK cosineSimilarity', queryVectorId: query.id, allScores: semanticAll, top: semantic },
        fusion: { algorithm: 'RRF', k: settings.fusion.k, rankStartsAt: 1, all: fused, top: fused.slice(0, 3) } });
    }
  }
  return { corpusTokens, cases };
}
