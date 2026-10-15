import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root, sha256, json } from '../src/files.mjs';

// 从仓库原文定位连续段落；教师只添加任务口径，不改写小说。
const corpusFile = path.resolve(root, '../../materials/凡人修仙传/原文片段.json');
const corpus = JSON.parse(fs.readFileSync(corpusFile, 'utf8'));
const sources = Object.fromEntries(corpus.sources.map(source => [source.id, source]));
const inputDir = path.join(root, 'inputs');
const files = {};
const put = (name, value) => { files[name] = typeof value === 'string' ? value : json(value); };
function paragraph(sourceId, beginning) {
  const source = sources[sourceId], text = source.text.split('\n').find(line => line.trim().startsWith(beginning));
  assert.ok(text, sourceId + ' 缺少原段：' + beginning);
  return { originalSourceId: sourceId, start: source.text.indexOf(text), end: source.text.indexOf(text) + text.length, text };
}
const original = (id, sourceId, beginning, extra = {}) => ({ id, ...paragraph(sourceId, beginning), ...extra });
const chapters = ['C03', 'C04', 'C05'].map((id, n) => {
  const source = sources[id], body = source.text;
  let offset = 0;
  const paragraphs = body.split('\n').map((text, p) => { const item = { sourceId: 'C' + (n + 1) + 'P' + String(p + 1).padStart(2, '0'), text, start: offset, end: offset + text.length }; offset += text.length + 1; return item; });
  assert.equal(paragraphs.map(p => p.text).join('\n'), body);
  return { chapterId: 'C' + (n + 1), originalSourceId: id, title: source.title, body, paragraphs, sha256: sha256(body) };
});
put('长文-完整三段与段落定位.json', { kind: '现成小说的三段连续原文，不是三章完整章节或模型草稿', metadata: '作品：《凡人修仙传》，忘语。仅使用仓库C03、C04、C05连续原文，从上山选拔到初见墨大夫；不补读后文，不续写。C1/C2/C3表示本实验的三段，P号对应原有换行。', originalSha256: corpus.originalSha256, sourceSha256: corpus.sourceSha256, chapters });
put('长文-独立核查参考.json', { kind: '调用前的独立原文回查清单，不进入模型输入', requiredRelations: ['舞岩十三岁、有家庭关系；这与后来师兄议论其保送原因不是同一层依据。', '岳堂主规定正午前登顶，未按时仍可因表现收为记名；韩立未独力按时登顶，由师兄抱上。', '岳堂主宣布七人合格：六入百锻堂、舞岩保送七绝堂；韩立张铁另获半年后考核机会，尚未成为正式内门弟子。', '送往七绝堂是宣布的安排；亲戚作用来自师兄议论和韩立理解，不能把议论写成岳堂主宣布的理由。', '墨大夫领韩立张铁入神手谷，晚间宣布收为记名弟子；会教采药炼药，医术只是也许，不教武功。', '三段末尾仍是初次谈话，没有学成医术、完成半年考核或升为正式弟子。'], finalSummaryHanRange: [300, 450], mapSummaryHanRange: [200, 320], unresolvedRange: [2, 4], evidenceRules: '编号存在不代表支持整项判断。连读原段，区分明确发生、宣布安排、人物理解及未来条件。' });
put('长文-instructions.txt', '只依据本次原文整理可回查的阅读笔记，不续写小说，不补造原因或已实现的未来。区分实际行动、宣布的安排、人物议论与理解、尚未实现的承诺。每个evidence.claim由相应原段支持，复合判断列出足够的原段编号。只返回指定JSON对象，不用Markdown围栏、不自评分。');
put('长文-goal.txt', '为没有读过原文的人写一份选拔与入谷事件笔记：交代人物怎样到达当前阶段，正式/记名身份怎样变化，哪些结论只是人物的理解，哪些教学承诺仍未实现。summary为300—450个汉字（只计汉字）；unresolved为2—4项，只保留本材料仍未解决、会影响后续理解的事项。返回{"summary":"笔记","unresolved":["待核事项"],"evidence":[{"claim":"具体判断","sourceIds":["C1P01"]}]}。');
const wrap = '<metadata>\n{metadata}\n</metadata>\n<materials>\n{materials}\n</materials>';
put('长文-whole.txt', '{goal}\n\n本次提供三段完整原文，请连起事件与条件，不把三段孤立重述。\n\n' + wrap);
put('长文-map.txt', '你只看到三段连续原文中的一段，不能声称读过全部原文。为同一事件笔记保留本段的行动、身份、明确安排、人物理解和未决条件。summary为200—320个汉字，unresolved为2—4项。返回{"summary":"本段笔记","unresolved":["待核事项"],"evidence":[{"claim":"具体判断","sourceIds":["C1P01"]}]}。\n\n' + wrap);
put('长文-reduce.txt', '{goal}\n\n下面仅是三份实际生成的笔记，不是原文；不能凭笔记恢复被省略的内容。把相同事件与状态变化接起来，含糊或冲突保留为待核。引用沿用笔记中的原段编号，步骤名不是原文来源。\n\n<metadata>\n{metadata}\n</metadata>\n<notes>\n{materials}\n</notes>');
put('长文-refine-first.txt', '{goal}\n\n这是第一步，只提供第一段原文。仅写当前支持的内容，不预写后两段。\n\n' + wrap);
put('长文-refine-next.txt', '{goal}\n\n这是逐块修订第{chapter}步。你收到上一份实际笔记和新增一段原文，没有此前各段全文。按新材料更新旧状态，保留仍适用的条件与来源；旧笔记的缺项没有新依据时不能凭空恢复。\n\n<metadata>\n{metadata}\n</metadata>\n<previous>\n{previous}\n</previous>\n<new_material>\n{materials}\n</new_material>');

const labelRecords = [
  original('F01', 'C03', '那名少年叫舞岩'), original('F02', 'C03', '“大家听好'),
  original('F03', 'C04', '“这次合格者'), original('F04', 'C04', '“另一人舞岩'),
  original('F05', 'C04', '“至于其他人'), original('F06', 'C05', '“他和你们不一样'),
  original('F07', 'C05', '“我现在人手不够'), original('F08', 'C05', '“这是神手谷'),
  original('F09', 'C05', '“山谷附近有个大厨房'), original('F10', 'C05', '直到韩立在一边站得脚都有点麻'),
  original('F11', 'C03', '彩霞山原名落凤山'), original('F12', 'C05', '冷冷的师兄冷哼了一声')
];
put('分类-十二条原文.json', { kind: '从现成小说选取的十二个连续原段；分类只整理阅读主题，不验证人物说法为客观事实', batches: [labelRecords.slice(0, 6).map(r => r.id), labelRecords.slice(6).map(r => r.id)], records: labelRecords });
const identity = { code: 'IDENTITY', name: '人物背景与理解', include: '人物年龄、家庭关系、长期背景，或原段明确写出的主观理解。', exclude: '当前动作本身不泛称为长期经历，一般对白不自动算主观理解；明确的分堂去向或教学内容单列相应安排，纯景物不归此类。' };
const living = { code: 'LIVING', name: '生活安排', include: '住宿、吃饭、领取食物等日常安排。', exclude: '分堂、录取或教学去向不属于日常生活。' };
const placement = { code: 'PLACEMENT', name: '选拔、身份与去向', include: '考核资格与条件、正式或记名身份、分堂和分配岗位。', exclude: '具体要教什么、不教什么及学成后的条件结果，另用TEACHING。' };
const teaching = { code: 'TEACHING', name: '未来教学与条件', include: '将学习什么、不教什么、是否可能传授，或一旦学成后才有的结果。', exclude: '仅出现“习武之苦”而没有教学内容，不单独贴此类；宣布去哪个堂本身用PLACEMENT。' };
const commonRules = ['按完整原段与当前定义多标签，不按关键词；每个标签给独立连续原句。', 'unknown用于原文不足以判断本次主题；other用于主题清楚但当前清单未覆盖，两者labels均为空并说明理由。', '分类主题不等于原文人物的推测或未来承诺已经实现。'];
const books = { v1: { version: 'v1', purpose: '为阅读笔记查找人物、门内安排与生活主题', rules: commonRules, labels: [identity, { code: 'ARRANGEMENT', name: '门内安排', include: '选拔资格、身份与去向、岗位分配，以及未来要学习的内容和学成后的条件结果。', exclude: '年龄与家庭背景单列IDENTITY，住宿吃饭单列LIVING，纯景物不属于此类。' }, living] }, v2: { version: 'v2', purpose: '把门内安排分开交给选拔/去向笔记与教学条件笔记', rules: [...commonRules, '将v1的ARRANGEMENT拆成PLACEMENT和TEACHING；全量重新阅读，不按旧列名猜细类；同段两种安排都有时可以同时出现。'], labels: [identity, placement, teaching, living] } };
for (const [version, book] of Object.entries(books)) put('分类-口径-' + version + '.json', book);
put('分类-独立参考.json', { kind: '调用前的人工作业口径，不进入模型输入；含义仍须完整原段独立核对', v1: [['F01', 'classified', ['IDENTITY', 'ARRANGEMENT']], ['F02', 'classified', ['ARRANGEMENT']], ['F03', 'classified', ['ARRANGEMENT']], ['F04', 'classified', ['ARRANGEMENT']], ['F05', 'classified', ['ARRANGEMENT']], ['F06', 'classified', ['ARRANGEMENT']], ['F07', 'classified', ['ARRANGEMENT']], ['F08', 'classified', ['LIVING']], ['F09', 'classified', ['LIVING']], ['F10', 'classified', ['ARRANGEMENT']], ['F11', 'other', []], ['F12', 'classified', ['IDENTITY']]], v2Difference: { F01: ['IDENTITY', 'PLACEMENT'], F02: ['PLACEMENT'], F03: ['PLACEMENT'], F04: ['PLACEMENT', 'TEACHING'], F05: ['PLACEMENT', 'TEACHING'], F06: ['PLACEMENT', 'TEACHING'], F07: ['PLACEMENT'], F10: ['PLACEMENT', 'TEACHING'] } });
put('分类-共同规则.txt', '读完整小说原段，只按当前任务与标签说明分类。保留原ID和逐字连续引文，不把人物理解当叙述者确认，也不把将来教导当已经学成。主题可以重叠；不要因为一个关键词贴标签。只返回指定JSON，不用Markdown围栏，不自评分。');
put('分类-发现模板.txt', '为组织小说阅读笔记，比较下面这一批原段，提出候选主题，不要为每条单建一个类别。此时尚无固定清单，不合并不同处理需要来强求互斥；保留无法归类的原因。返回{"candidates":[{"name":"主题","description":"边界","recordIds":["F01"],"evidence":[{"recordId":"F01","quote":"本段连续原句"}]}],"unresolved":[{"recordId":"F01","reason":"缺口或范围"}]}。\n<records>\n{records}\n</records>');
put('分类-重标模板.txt', '按本次完整口径重新读全部原段，不沿用旧标签或发现结果。允许多标签，每个标签引用对应原段的连续文字。status为classified/unknown/other；unknown和other的labels为空，reason分清信息不足与范围未覆盖。返回本批全部ID各一次，不新增ID。返回{"codebookVersion":"{version}","items":[{"id":"F01","status":"classified","labels":[{"code":"IDENTITY","quote":"原句"}],"reason":"按定义选择的依据"}]}。\n<codebook>\n{codebook}\n</codebook>\n<records>\n{records}\n</records>');

const records = [
  original('R01', 'C03', '竹林应该非常宽广', { group: '进入竹林的孩童', scope: '只收本段人数，不把三十余写成准确30或31' }),
  original('R02', 'C04', '“这次合格者', { group: '岳堂主宣布的合格者', scope: '只收本段明说数量，不从下一段补其他称呼' }),
  original('R03', 'C04', '“另一人舞岩', { group: '保送七绝堂者', scope: '另一人表示1人；不把保送换算为已学成或护法' }),
  original('R04', 'C04', '“至于其他人', { group: '韩立与张铁', scope: '仅这两人，目前还需半年后考核，未正式成为内门弟子' }),
  original('R05', 'C05', '“是的。这些人中', { group: '下山同行的一组', scope: '这里明确报告六名正式与两名记名，允许相加得本组8人' }),
  original('R06', 'C05', '“是的。这些人中', { group: '下山同行的一组', scope: '同一原段被重复导入，身份定位与R05完全一致', duplicateOf: 'R05' }),
  original('R07', 'C05', '“我现在人手不够', { group: '墨大夫准备补充的岗位', scope: '统计还缺的岗位人数，属于计划需求，不是实际已有员工数' }),
  original('R08', 'C05', '直到韩立在一边站得脚都有点麻', { group: '墨大夫新收的两名记名弟子', scope: '从即日起是当前身份；会教和也许还教是未来安排，不是已学成' }),
  original('R09', 'C04', '“王护法，剩下之人', { group: '将遣送回家的其余孩童', scope: '这是指令，不证明已经领钱回家；剩余人数未明确给出' }),
  original('R10', 'C03', '最后一类人就是韩立这类', { group: '车内来自穷乡僻壤的孩子', scope: '五六人为约数，准确人数未知' })
];
put('抽取与批量-十段原文.json', { kind: '小说原段加教师抽取范围；group/scope/重复导入身份是任务元信息，text全为现成原文', scope: { extraction: records.slice(0, 8).map(r => r.id), batchBase: records.slice(0, 8).map(r => r.id), templateComparison: records.map(r => r.id) }, records });
const fields = ['sourceId', 'group', 'status', 'totalCount', 'formalCount', 'probationaryCount', 'duplicateOf'];
const expected = [
  ['R01', 'observed', null, null, null], ['R02', 'observed', 7, 6, null], ['R03', 'observed', 1, null, null], ['R04', 'observed', 2, 0, null], ['R05', 'observed', 8, 6, 2], ['R06', 'observed', 8, 6, 2], ['R07', 'planned', 2, null, null], ['R08', 'observed', 2, 0, 2], ['R09', 'planned', null, null, null], ['R10', 'observed', null, null, null]
].map(([sourceId, status, totalCount, formalCount, probationaryCount]) => ({ sourceId, group: records.find(r => r.id === sourceId).group, status, totalCount, formalCount, probationaryCount, duplicateOf: sourceId === 'R06' ? 'R05' : null }));
const summary = n => ({ distinctSourceIds: records.slice(0, n).filter(r => !r.duplicateOf).map(r => r.id), ratioSourceIds: ['R05'], formalNumerator: 6, groupDenominator: 8, formalRatio: 0.75, unknownTotalSourceIds: expected.slice(0, n).filter(r => r.totalCount === null).map(r => r.sourceId), plannedSourceIds: expected.slice(0, n).filter(r => r.status === 'planned').map(r => r.sourceId) });
put('抽取-独立参考.json', { kind: '调用前独立参考，不发送给模型。正式人数只收本段明确报告的数量，不把合格、保送等称呼自行归并。', fields, numericFields: ['totalCount', 'formalCount', 'probationaryCount'], records: expected, summaries: { eight: summary(8), ten: summary(10) }, limits: ['只统计指定同行群体，不是全部考核者的录取率；约数不补为准确整数。', '同一原段重复导入不重复累计；跨场景人群重叠，不把各行人数相加称独立人数。', '计划需求、未来教学与已发生状态分开，不由此评价选拔公平或教学效果。'], csv: { columns: fields } });
put('抽取-共同规则.txt', '仅按每项完整小说原段和教师scope抽取，原文不改写。group与sourceId保留任务给出的身份，引用只能来自本项text。证据能定位不表示数量或时点已正确；按口径区分约数、未知、明确零与未来安排。只返回指定JSON，不用Markdown围栏，不自评分。');
const rules = '每项业务字段固定sourceId/group/status/totalCount/formalCount/probationaryCount/duplicateOf，外加evidence字符串。sourceId必须是本项id（R01等），不能填originalSourceId中的C号；group照本项元信息。status为observed（当前已发生或已宣布身份/去向）或planned（本任务统计的还缺岗位、将来遣送指令）。totalCount为该任务范围准确人数，正式与记名人数只收本段明确报告的数量；明确本组两人尚非正式时formalCount为0，未报告的量为null，约数不任选整数；R07的2是计划需求人数，不能当现有员工。R05可将6名正式与2名记名相加得到8，R06同原段重复导入保留行但duplicateOf为R05。不能从相邻记录或未来结果反填本段未提供的量。evidence用本段一个连续原句，支持本项数值和时点，不用教师scope冒充小说原句。\n\n顶层为records与summary。summary为distinctSourceIds（按原文originalSourceId/start/end去重后保留的首次记录ID）、ratioSourceIds、formalNumerator、groupDenominator、formalRatio、unknownTotalSourceIds、plannedSourceIds、limits。比例只问“下山同行的一组”中明确报告的正式人数占本组人数：分子和分母取同一组，重复导入只用首次记录，不加别的时点、计划需求、其他群体或约数。比例用0到1的小数，不统计全部考核者的录取率。unknownTotalSourceIds列准确总数未知项；plannedSourceIds列计划项。limits说明资料支持范围、约数、重叠与未来条件。不要输出CSV。';
put('抽取-字段与统计口径.txt', rules);
const task = ids => rules + '\n\n<records>\n' + json(records.filter(r => ids.includes(r.id))) + '</records>';
put('抽取-完整八份任务.txt', task(records.slice(0, 8).map(r => r.id)));
put('模板-V1完整任务.txt', task(records.map(r => r.id)));
const addition = '提交前只在内部核对，不输出自评分：逐项核来源身份与本段范围；约数不变准确数，未报告的量不填0，未来安排不写成已发生；同一原段重复输入保留两行但只用首次来源统计。比例的分子与分母必须同属题目指定的下山同行群体，不把七名合格者、两名待考核者、计划岗位或全体考核孩童混进来。再核records与summary及精确JSON格式。';
put('模板-V2唯一增加段.txt', addition); put('模板-V2完整任务.txt', files['模板-V1完整任务.txt'] + '\n' + addition);
put('逐项-修复模板.txt', '这是一项真实抽取候选的定点修复，不重新处理其他项。原候选与程序发现的问题都保留，程序检查并不替代原文语义。根据下面同一项的原文、任务范围、字段口径和实际检查，返回这一项完整字段对象（不是records/summary顶层），只返回纯JSON；不改其他ID，不声称整批汇总已重算。');
put('逐项-本地边界候选.json', { kind: '教师明确构造的本地边界检查，0模型，不是真实模型回答或失败；不进入云修复', candidates: [{ ...expected[0], totalCount: 30, evidence: records[0].text }, { ...expected[6], status: 'observed', evidence: records[6].text }] });
put('非敏感固定设置.json', { kind: '非敏感课堂条件，不含密钥', temperature: 0, maxRetries: 0, thinking: { type: 'disabled' }, maxOutputTokens: { longText: 4096, classification: 4096, extraction: 8192, itemRepair: 4096, templateComparison: 8192 }, calls: { longText: 8, classification: 6, extraction: 1, templateComparison: 2, itemRepairMaximum: 2, baseTotal: 17, maximumTotal: 19 }, itemRepairOrigin: '仅对真实候选中确需修复的项执行，最多2次；原答均过则0次。教师边界输入只运行本地检查。', mapConcurrency: 3, repairConcurrency: 2, prices: '用量来自实际返回，不据自定义模型别名猜单价或账单。' });
put('原文定位说明.json', { novel: corpus.novel, author: corpus.author, originalSha256: corpus.originalSha256, sourceSha256: corpus.sourceSha256, source: '../../materials/凡人修仙传/原文片段.json', positionUnit: 'utf16', rules: 'start/end相对所引C号的text。十二分类、十抽取记录的text均为原文中的完整连续段落；R06是R05同一原段重复导入，不是新增故事事实。' });
// 只移除本目录不再使用的旧输入，历史请求和回答不修改。
for (const name of fs.readdirSync(inputDir)) if (name !== 'registry.json' && !Object.hasOwn(files, name)) fs.unlinkSync(path.join(inputDir, name));
for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(inputDir, name), text);
const registry = { frozen: true, sourceKind: '由现成凡人原文及调用前教学口径生成，实际执行Git起点另记', originalSha256: corpus.originalSha256, sourceSha256: corpus.sourceSha256, files: Object.keys(files).sort().map(name => { const raw = fs.readFileSync(path.join(inputDir, name)); return { key: name, name, bytes: raw.length, sha256: sha256(raw) }; }) };
fs.writeFileSync(path.join(inputDir, 'registry.json'), json(registry));
console.log(json({ inputFiles: registry.files.length, originalParagraphs: chapters.reduce((n, c) => n + c.paragraphs.filter(p => p.text.trim()).length, 0), modelCalls: 0 }));
