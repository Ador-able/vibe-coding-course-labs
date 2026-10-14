const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sameKeys = (value, keys) => object(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
export const fieldNames = { sourceId: '来源', taskId: '整理任务', date: '日志日期', title: '标题', status: '日志工作状态', pendingAssertions: '清单总数', passedAssertions: '已核通过', problemEvents: '问题标注事件', actualMinutes: '实际分钟', budgetMinutes: '预留分钟', duplicateOf: '重复来源', uniqueObservedSourceIds: '去重后的实际日志', ratioSourceIds: '比率使用的日志', sumPassed: '同组已核通过合计', sumPending: '同组清单总数合计', passRatio: '同组通过比例', knownActualMinutes: '已知实际分钟', knownProblemEvents: '已知问题事件', knownProblemSourceIds: '问题事件已知的日志' };
export function parseCandidate(text) { try { return { value: JSON.parse(text), error: null }; } catch (error) { return { value: null, error: { name: error.name, message: error.message } }; } }
export function checkExtraction(text, material, reference, scope) {
  const parsed = parseCandidate(text), ids = material.scope[scope], fields = reference.fields;
  const check = { parseError: parsed.error, formatIssues: [], coverageIssues: [], valueIssues: [], evidenceIssues: [], summaryIssues: [], semanticDecision: 'pending', wholeTaskAdopted: false };
  if (parsed.error) return { ...check, mechanicalState: 'failed' };
  const value = parsed.value;
  if (!sameKeys(value, ['records', 'summary'])) check.formatIssues.push('顶层须为 records 和 summary。');
  const rows = value?.records;
  if (!Array.isArray(rows)) check.formatIssues.push('记录须为数组。');
  else {
    const actualIds = rows.map(row => row?.sourceId);
    if (actualIds.length !== ids.length || new Set(actualIds).size !== ids.length || ids.some(id => !actualIds.includes(id))) check.coverageIssues.push({ expected: ids, actual: actualIds });
    for (const row of rows) {
      const id = row?.sourceId, gold = reference.records.find(item => item.sourceId === id), source = material.records.find(item => item.id === id);
      if (!sameKeys(row, [...fields, 'evidence']) || !sameKeys(row?.evidence, fields.slice(1))) check.formatIssues.push({ sourceId: id, message: '业务字段及全部证据字段须齐全。' });
      if (!object(row)) continue;
      for (const field of fields) {
        const actual = row[field];
        if (['pendingAssertions', 'passedAssertions', 'problemEvents', 'actualMinutes', 'budgetMinutes'].includes(field)) {
          if (!(actual === null || (Number.isInteger(actual) && actual >= 0))) check.formatIssues.push({ sourceId: id, field, message: '应为非负整数或 null。' });
        } else if (field === 'duplicateOf' ? actual !== null && typeof actual !== 'string' : typeof actual !== 'string') check.formatIssues.push({ sourceId: id, field, message: '字段类型不符。' });
        if (gold) {
          const acceptedTitles = reference.ambiguousTitleIds.includes(id) ? [gold.title, gold.title.replace(/。$/, '')] : [gold.title];
          if (!(field === 'title' ? acceptedTitles.includes(actual) : actual === gold[field])) check.valueIssues.push({ sourceId: id, field, expected: field === 'title' ? acceptedTitles : gold[field], actual });
        }
      }
      if (!['observed', 'planned'].includes(row.status)) check.formatIssues.push({ sourceId: id, field: 'status', message: '工作状态超出约定。' });
      for (const field of fields.slice(1)) {
        const quote = row.evidence?.[field], allowedNull = ['budgetMinutes', 'duplicateOf'].includes(field) && row[field] === null && quote === null;
        if (!(allowedNull || (source && typeof quote === 'string' && quote.length && source.text.includes(quote)))) check.evidenceIssues.push({ sourceId: id, field, quote: quote ?? null, message: '不是本项连续原句。' });
      }
    }
  }
  const expected = reference.summaries[scope === 'extraction' || scope === 'batchBase' ? 'eight' : 'ten'];
  if (!sameKeys(value?.summary, [...Object.keys(expected), 'limits'])) check.summaryIssues.push({ message: '汇总字段不完整或增加未知字段。' });
  for (const [field, gold] of Object.entries(expected)) {
    const actual = value?.summary?.[field];
    const equal = Array.isArray(gold) ? Array.isArray(actual) && new Set(actual).size === actual.length && actual.length === gold.length && gold.every(id => actual.includes(id)) : typeof actual === 'number' && Math.abs(actual - gold) < 1e-12;
    if (!equal) check.summaryIssues.push({ field, expected: gold, actual });
  }
  check.mechanicalState = ['formatIssues', 'coverageIssues', 'valueIssues', 'evidenceIssues', 'summaryIssues'].every(key => !check[key].length) ? 'passed' : 'failed';
  return check;
}
export function checkLong(text, knownIds, reference, isMap) {
  const parsed = parseCandidate(text), check = { parseError: parsed.error, formatIssues: [], invalidSourceIds: [], semanticDecision: 'pending', wholeTaskAdopted: false };
  if (!parsed.error) {
    const result = parsed.value;
    if (!sameKeys(result, ['summary', 'unresolved', 'evidence']) || typeof result?.summary !== 'string' || !Array.isArray(result?.unresolved) || !Array.isArray(result?.evidence)) check.formatIssues.push('摘要、待核项与证据结构不符。');
    check.han = typeof result?.summary === 'string' ? (result.summary.match(/\p{Script=Han}/gu) || []).length : 0;
    check.hanRange = isMap ? reference.mapSummaryHanRange : reference.finalSummaryHanRange;
    check.lengthMeetsRequest = check.han >= check.hanRange[0] && check.han <= check.hanRange[1];
    check.unresolvedCount = result?.unresolved?.length ?? 0;
    check.unresolvedCountMeetsRequest = check.unresolvedCount >= reference.unresolvedRange[0] && check.unresolvedCount <= reference.unresolvedRange[1];
    for (const item of Array.isArray(result?.evidence) ? result.evidence : []) {
      if (!object(item) || typeof item.claim !== 'string' || !Array.isArray(item.sourceIds)) { check.formatIssues.push('证据需要判断及原段编号。'); continue; }
      for (const id of item.sourceIds) if (!knownIds.includes(id)) check.invalidSourceIds.push(id);
    }
  }
  check.mechanicalState = !check.parseError && !check.formatIssues.length && !check.invalidSourceIds.length && check.lengthMeetsRequest && check.unresolvedCountMeetsRequest ? 'passed' : 'failed';
  return check;
}
export function checkLabels(text, stage, ids, material, codebook, reference) {
  const parsed = parseCandidate(text), check = { parseError: parsed.error, issues: [], rows: [], semanticDecision: 'pending', wholeTaskAdopted: false };
  if (parsed.error) return { ...check, mechanicalState: 'failed', usableRecords: 0, submittedRecords: ids.length };
  if (stage === 'discovery') return { ...check, discovery: parsed.value, mechanicalState: 'ungraded', usableRecords: 0, submittedRecords: ids.length };
  const value = parsed.value, rows = value?.items;
  if (value?.codebookVersion !== stage || !Array.isArray(rows)) check.issues.push('标签版本或记录结构不符。');
  const legal = codebook.labels.map(label => label.code);
  if (Array.isArray(rows)) {
    const actualIds = rows.map(row => row?.id);
    if (actualIds.length !== ids.length || new Set(actualIds).size !== ids.length || ids.some(id => !actualIds.includes(id))) check.issues.push('本批来源覆盖不完整或重复。');
    for (const row of rows) {
      const source = material.records.find(item => item.id === row?.id), issues = [];
      if (!source || !ids.includes(row.id) || !['classified', 'unknown', 'other'].includes(row.status) || !Array.isArray(row.labels) || typeof row.reason !== 'string') issues.push('分类结构或身份不符。');
      const labels = Array.isArray(row?.labels) ? row.labels : [], codes = labels.map(label => label.code);
      if (new Set(codes).size !== codes.length || codes.some(code => !legal.includes(code))) issues.push('主题代码不合法或重复。');
      if ((row?.status === 'classified') !== Boolean(labels.length)) issues.push('处理状态和空标签不符。');
      for (const label of labels) if (!(source && typeof label.quote === 'string' && label.quote.length && source.text.includes(label.quote))) issues.push('引用不是本条连续原文。');
      const expected = reference.v1.find(item => item[0] === row?.id);
      const expectedCodes = stage === 'v2' ? reference.v2Difference[row?.id] ?? expected?.[2] : expected?.[2];
      check.rows.push({ ...row, issues, referenceMatches: Boolean(expected && row.status === expected[1] && JSON.stringify([...codes].sort()) === JSON.stringify([...expectedCodes].sort())) });
    }
  }
  check.usableRecords = check.issues.length ? 0 : check.rows.filter(row => !row.issues.length).length; check.submittedRecords = ids.length;
  check.mechanicalState = !check.issues.length && check.rows.every(row => !row.issues.length) ? 'passed' : 'failed'; return check;
}
