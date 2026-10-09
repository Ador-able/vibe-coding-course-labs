import assert from 'node:assert/strict';
import { create, insert, remove, getByID, count, search } from '@orama/orama';
import { createTokenizer } from '@orama/tokenizers/mandarin';
import { cosineSimilarity } from 'ai';
import { matchesWhere, oramaWhere, byId } from './materials.mjs';
import { reciprocalRankFusion } from './retrieval.mjs';

export async function replaceCurrentSource(material, newEmbeddings, observation, save) {
  const { before, after, action, previousEmbeddings } = material;
  let db, current = before;
  const beforeVectors = before.map(row => previousEmbeddings.embeddings.find(value => value.id === row.id));
  let currentVectors = beforeVectors;
  observation.status = 'building'; observation.before = before; observation.beforeVectors = beforeVectors;
  observation.archive = { source: action.oldBlock, vector: beforeVectors.find(value => value.id === action.oldBlock.id),
    answerASources: material.prompts.A.sources };
  observation.initialInsertReturns = []; observation.remove = null; observation.insert = null; save();
  const snapshot = () => {
    if (!db) return null;
    const knownIds = [...new Set([...before, ...after].map(row => row.id))];
    return { count: count(db), lookup: knownIds.map(id => {
      const document = getByID(db, id);
      return { id, found: document !== undefined, document: document === undefined ? null : structuredClone(document) };
    }) };
  };
  try {
    const tokenizer = createTokenizer();
    db = create({ schema: { id: 'string', text: 'string', collection: 'enum', version: 'enum', projectCode: 'enum' }, components: { tokenizer } });
    // Orama只索引schema字段，成熟文档存储保留完整原对象的其余定位元信息。
    for (const row of before) observation.initialInsertReturns.push({ id: row.id, result: await insert(db, structuredClone(row)) });
    observation.indexBefore = snapshot(); save();
    assert.equal(observation.indexBefore.count, 22);
    for (const row of before) assert.deepEqual(getByID(db, row.id), row);
    observation.status = 'removing'; observation.remove = { id: action.oldBlock.id, result: null, error: null }; save();
    observation.remove.result = await remove(db, action.oldBlock.id);
    observation.afterRemove = snapshot(); save();
    assert.equal(observation.remove.result, true); assert.equal(getByID(db, action.oldBlock.id), undefined);
    current = before.filter(row => row.id !== action.oldBlock.id);
    currentVectors = beforeVectors.filter(value => value.id !== action.oldBlock.id);
    observation.status = 'inserting'; observation.insert = { id: action.replacement.id, result: null, error: null }; save();
    observation.insert.result = await insert(db, structuredClone(action.replacement));
    observation.indexAfter = snapshot(); save();
    assert.equal(observation.insert.result, action.replacement.id); assert.equal(count(db), 22);
    current = after;
    currentVectors = after.map(row => row.id === action.replacement.id ? newEmbeddings[0] : beforeVectors.find(value => value.id === row.id));
    assert.equal(getByID(db, action.oldBlock.id), undefined);
    for (const row of current) assert.deepEqual(getByID(db, row.id), row);
    for (const id of action.unchangedBlockIds) assert.deepEqual(currentVectors.find(value => value.id === id), beforeVectors.find(value => value.id === id));
    observation.current = current; observation.currentVectors = currentVectors; observation.status = 'updated'; save();
    return { db, tokenizer, current, currentVectors };
  } catch (error) {
    observation.failedAt = observation.status;
    const operation = observation.status === 'removing' ? observation.remove : observation.status === 'inserting' ? observation.insert : null;
    if (operation) operation.error = { name: error.name, message: error.message };
    observation.status = 'failed'; observation.current = current; observation.currentVectors = currentVectors;
    observation.indexAtFailure = snapshot(); observation.error = { name: error.name, message: error.message }; save(); throw error;
  }
}

export async function rankCurrentSource(material, index, queryVector) {
  const { settings, query } = material, { db, tokenizer, current, currentVectors } = index;
  const where = settings.retrievalAfter.where, lexical = settings.retrievalAfter.lexical;
  const eligible = current.filter(row => matchesWhere(row, where));
  const byDocument = new Map(current.map(row => [row.id, row]));
  const vectorMap = new Map(currentVectors.map(value => [value.id, value.embedding]));
  const params = { term: query.keywords, ...lexical, where: oramaWhere(where) };
  const apiTopResult = await search(db, params);
  const apiFullResult = await search(db, { ...params, limit: current.length });
  const allHits = apiFullResult.hits.map(hit => ({ id: hit.id, score: hit.score, document: byDocument.get(hit.id) }));
  allHits.sort((a, b) => b.score - a.score || byId(a, b));
  const topLexical = allHits.slice(0, lexical.limit);
  const allScores = eligible.map(document => ({ id: document.id, document, score: cosineSimilarity(queryVector.embedding, vectorMap.get(document.id)) }));
  assert(allScores.every(row => Number.isFinite(row.score)), '当前余弦分数须为有限值');
  allScores.sort((a, b) => b.score - a.score || byId(a, b));
  const topSemantic = allScores.slice(0, settings.retrievalAfter.semantic.limit);
  const fusion = reciprocalRankFusion(topLexical, topSemantic, settings.retrievalAfter.fusion.k);
  return { id: 'Q2-current-followup', originalFollowUp: query.followUp, question: query.independentQuery,
    queryAuthor: query.queryAuthor, keywords: query.keywords, where, currentCorpus: current,
    eligibleIds: eligible.map(row => row.id), eligibleDocuments: eligible,
    corpusTokens: current.map(row => ({ id: row.id, tokens: tokenizer.tokenize(row.text, undefined, 'text') })),
    lexical: { tokens: tokenizer.tokenize(query.keywords, undefined, 'text'), params, apiTopResult, apiFullResult, allHits,
      allEligibleScores: eligible.map(document => ({ id: document.id, document, score: allHits.find(hit => hit.id === document.id)?.score ?? null })), top: topLexical },
    semantic: { measure: 'AI SDK cosineSimilarity', queryVectorId: queryVector.id, allScores, top: topSemantic },
    fusion: { algorithm: 'RRF', k: settings.retrievalAfter.fusion.k, rankStartsAt: 1, all: fusion },
    rerankCalls: 0, scope: '一次当前范围检索；完整并集才决定B来源，相关性与支持关系仍需人工判断。' };
}
