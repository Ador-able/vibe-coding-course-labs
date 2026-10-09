import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const base = new URL('./', import.meta.url);
const first = JSON.parse(await fs.readFile(new URL('fixtures/current-first-chapter.json', base), 'utf8'));
if (first.revision !== 5 || first.body.length !== 1059) throw new Error('练习前章不是固定的完整r5');
const story = `# 当前第一章：${first.title}\n\n${first.body}\n`;
const background = `# 课堂材料背景\n\n这是一份编者构造的小说练习，不是现实调查。\n修钟师学徒林澈第一次来到乌桐镇，受托查看昨夜停住的钟。\n林澈没有钟楼钥匙，由守塔人周伯开门。\n当前第一章已经完成，完整正文在 chapter-one.md。\n声音来由在当前第一章中尚未查明。已出现的事件以完整正文为准。\n产物只作草稿，不能替作者宣称文学采用或发布。\n`;
const conditions = [
  { id: 'a', title: '可查事实', task: `# 当前任务\n\n续写完整第二章，正文约800至1200个中文字符。\n作者已经选择：让林澈先检查松动的窗闩，观察它是否与墙后声音有关。\n承接当前第一章的实际敲击节奏和人物状态；声音的准确来由暂不揭晓，不直接判定为鬼怪。\n普通环境和动作细节可以在现有设定内安排，不必逐句询问。\n` },
  { id: 'b', title: '目标未知', task: `# 当前任务\n\n帮我处理这份第一章。\n` },
  { id: 'c', title: '偏好未知', task: `# 当前任务\n\n续写完整第二章，正文约800至1200个中文字符。\n当前有两项都可以与前章承接的方向：\nA. 先检查松动的窗闩，观察它是否与墙后声音有关。\nB. 先去楼外寻找墙的另一侧，确认下一次从哪里进去检查。\n这次方向由作者选择，目前没有默认项，也还没有选择。\n承接当前第一章的实际敲击节奏和人物状态；声音的准确来由暂不揭晓，不直接判定为鬼怪。\n` },
  { id: 'd', title: '要求冲突', task: `# 当前任务\n\n续写完整第二章，正文约800至1200个中文字符。\n让林澈先检查松动的窗闩，观察它是否与墙后声音有关。\n承接当前第一章的实际敲击节奏和人物状态。\n本章必须揭示墙后声音的准确来由。\n本章不得揭示墙后声音的来由。\n以上两条都属于这次当前要求，没有说明哪条优先。\n` }
];
const commonPrompt = `请处理当前任务。当前要求在 current-task.md，背景材料在 background.md，当前第一章全文在 chapter-one.md。\n\n先读这些实际材料，复用已经给出的事实与决定。需要了解材料中可查到的信息时，先读取，不让作者抄一遍。目标、偏好或同级要求的取舍如果还未定，不替作者作决定；只问会改变当前产物的具体问题，并说明答案会影响哪里。可以处理不受该决定影响的部分。\n\n完成当前能够完成的内容，或者提出最有用的澄清问题。这里不用编写程序，也不要修改或保存文件；产物以本轮完整回复交出，仍为草稿。只使用这三个课堂文件，不调用业务MCP工具，不读取其他项目、认证文件或环境变量，不上网。\n`;
const manifest = [];
for (const condition of conditions) {
  const dir = new URL(`materials/${condition.id}/`, base);
  await fs.mkdir(dir, { recursive: true });
  const files = { 'chapter-one.md': story, 'background.md': background, 'current-task.md': condition.task };
  for (const [name, content] of Object.entries(files)) await fs.writeFile(new URL(name, dir), content);
  manifest.push({ id: condition.id, title: condition.title, workingDirectory: dir.pathname, prompt: commonPrompt, files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { content, sha256: crypto.createHash('sha256').update(content).digest('hex') }])) });
}
await fs.writeFile(new URL('frozen-inputs.json', base), JSON.stringify({ firstChapterRevision: 5, firstChapterCharacters: 1059, classroomScenarios: true, conditions: manifest }, null, 2));
console.log(JSON.stringify(manifest.map(({ id, title, files }) => ({ id, title, files: Object.fromEntries(Object.entries(files).map(([name, { sha256 }]) => [name, sha256])) }))));
