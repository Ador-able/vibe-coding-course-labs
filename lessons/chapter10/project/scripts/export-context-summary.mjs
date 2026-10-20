import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';

const runDirectory=process.argv[2];
if(!runDirectory)throw new Error('请传入本轮已完成的只读摘要 run 目录。');
const report=JSON.parse(readFileSync(join(resolve(runDirectory),'report.json'),'utf8'));
if(report.state!=='completed'||report.readOnly!==true||report.chapterNumber!==1)throw new Error('只导出教学第1章已完成的只读摘要；失败或未完成记录保持原状。');
const events=readFileSync(join(resolve(runDirectory),'events.jsonl'),'utf8').split(/\r?\n/u).filter(Boolean).map(JSON.parse);
const calls=events.filter(event=>event.type==='item.completed'&&event.item.type==='mcp_tool_call').map(event=>event.item);
const work=calls.find(call=>call.tool==='read_work')?.result?.structured_content?.result;
const chapter=calls.find(call=>call.tool==='read_chapter'&&call.arguments.chapterNumber===1)?.result?.structured_content?.result;
const final=events.findLast(event=>event.type==='item.completed'&&event.item.type==='agent_message')?.item.text;
if(!work||!chapter||!final)throw new Error('记录缺少完整作品、当前第一章或末条模型回答，未生成摘要文件。');

// 外层定位取本轮工具返回，模型段直接保留事件中的原始字符串。
const outer=`# 第一章本轮真实摘要\n\n材料编号：FN-CONTEXT-02-SUMMARY\n\n性质：本轮真实模型任务的完整末条返回；来源定位由导出脚本从实际工具返回整理。\n\n来源定位：作品 ${work.id}《${work.title}》，教学第1章《${chapter.title}》，正文r${chapter.revision}，origin=${chapter.origin}，当前资料r${work.revision}，正文保存基线workRevision=${chapter.workRevision}，状态${chapter.status}。\n\n生成记录：run ${report.runId}；thread ${report.threadId}；源码 ${report.sourceVersion}。本轮目录：${runDirectory}。\n\n状态：参考材料，不是新的故事原文、已确认设定、大纲或采用记录。后续任务仍需取得工作台当前完整对象。\n\n## 模型完整末条返回（原样）\n\n`;
const output='materials/来稿/FN-CONTEXT-02-本轮摘要.md';
writeFileSync(output,outer+final,'utf8');
console.log(JSON.stringify({output,runId:report.runId,finalSha256:createHash('sha256').update(final,'utf8').digest('hex')}));
