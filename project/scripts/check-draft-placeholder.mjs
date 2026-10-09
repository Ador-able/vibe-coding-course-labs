import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

// 输入由宿主在 PostToolUse 中提供；只检查真实保存返回，不修改业务库。
const label=process.argv[2]??'correct';
let raw='';
for await(const chunk of process.stdin)raw+=chunk;
const input=JSON.parse(raw);
if(input.hook_event_name!=='PostToolUse')throw new Error('本检查只接受 PostToolUse。');
const chapter=input.tool_response?.structuredContent?.result;
if(input.tool_response?.isError||typeof chapter?.body!=='string'||!Number.isInteger(chapter?.revision))throw new Error('保存返回没有可检查的完整章节对象。');
const markers=[...chapter.body.matchAll(/【待补：[^\n】]+】/gu)].map(item=>item[0]);
const summary=`保存后机械检查：作品 ${chapter.workId}，第 ${chapter.number} 章，r${chapter.revision}。`;
const message=markers.length
 ?`${summary}正文仍有编辑占位符：${markers.join('、')}。这版已保存为草稿，检查不会撤销它。按照当前任务补写这些位置，保存新修订，再用 read_chapter 读回。检查只识别文字标记，不评价剧情与文学表现。`
 :`${summary}没有发现“【待补：…】”形式的编辑占位符。这个结果只说明标记不存在；场景是否连贯、已确认事实是否保持，仍需阅读正文判断。`;
const output={hookSpecificOutput:{hookEventName:'PostToolUse',additionalContext:message}};
const directory=resolve('runs/hooks',`${label}-${input.tool_use_id}`);
await mkdir(directory,{recursive:true});
await writeFile(resolve(directory,'stdin.json'),raw);
await writeFile(resolve(directory,'检查对象.json'),JSON.stringify({chapter,markers,scope:'编辑占位符机械检查，不作文学判断。'},null,2));
const stdout=JSON.stringify(output)+'\n';
await writeFile(resolve(directory,'stdout.txt'),stdout);
await writeFile(resolve(directory,'进程结果.json'),JSON.stringify({exitCode:0,stderr:'',label,toolUseId:input.tool_use_id},null,2));
process.stdout.write(stdout);
