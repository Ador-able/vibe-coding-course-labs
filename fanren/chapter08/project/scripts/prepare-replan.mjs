import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,access,copyFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {seedPrototype} from './prototype-seed.mjs';
import {Store} from '../dist/store.js';
import {getCodeVersion} from '../dist/version.js';

const {values}=parseArgs({options:{folder:{type:'string',default:'replan'},from:{type:'string',default:'task-state'}}});
const id='qinglan',runId=randomUUID(),folder=values.folder,db=`data/replan-${runId}.sqlite`;
for(const target of [folder,db]){try{await access(target);throw new Error(`目标已存在，请另取材料目录：${target}`);}catch(error){if(error.code!=='ENOENT')throw error;}}
// 使用所选跨会话实录的完整结果；档案不代表读者已执行任务。
const previous=JSON.parse(await readFile(`${values.from}/task.json`,'utf8'));
const sources={'前置-最新进度.md':previous.progress,'前置-完整材料核对.md':previous.review};
for(const source of [previous.deliverable,...Object.values(sources)])await access(source);
await mkdir(folder,{recursive:true});await mkdir('deliverables',{recursive:true});
const init=await seedPrototype(resolve(db),id);
const copied=[];
for(const [name,from] of Object.entries(sources)){const to=`${folder}/${name}`;await copyFile(from,to);const bytes=await readFile(to);assert.ok(bytes.equals(await readFile(from)));copied.push({name,from,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
const deliverable=`deliverables/replan-${runId}-旧三章待审.md`;await copyFile(previous.deliverable,deliverable);
const store=new Store(resolve(db));try{assert.ok((await readFile(deliverable)).equals(Buffer.from(store.exportWork(id).text,'utf8')));}finally{store.close();}
const calls=[];
for(const args of [['show'],['chapter','1'],['chapter','2'],['chapter','3']]){
  const result=execFileSync(process.execPath,['dist/cli.js',...args,'--db',db,'--work',id],{encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true});
  const path=`${folder}/改前-${args.join('-')}.json`;await writeFile(path,result);calls.push({args,output:path});
}
const show=JSON.parse(await readFile(`${folder}/改前-show.json`,'utf8')),chapter=JSON.parse(await readFile(`${folder}/改前-chapter-2.json`,'utf8'));
const markdown=(await readFile('materials/第二章-人工修改后.md','utf8')).replaceAll('\r\n','\n'),separator=markdown.indexOf('\n\n');
const proposal={workId:id,chapterNumber:2,expectedWorkRevision:show.work.revision,expectedChapterRevision:chapter.revision,expectedPreviousRevisions:show.chapters.filter(ch=>ch.number<2).map(ch=>({number:ch.number,revision:ch.revision})),title:markdown.slice(0,separator).replace(/^# /,''),body:markdown.slice(separator+2).trimEnd()};
await writeFile(`${folder}/第二章-人工修改完整输入.json`,JSON.stringify(proposal,null,2));
await writeFile(`${folder}/第二章-改前全文.md`,chapter.body);await writeFile(`${folder}/第二章-拟改后全文.md`,proposal.body);
const task={id,runId,db,folder,deliverable,review:`${folder}/前置-完整材料核对.md`,progress:`${folder}/当前进度.md`,plan:`${folder}/调整后的计划.md`,oldProgress:`${folder}/前置-最新进度.md`,codeVersion:getCodeVersion(),previous,copied,scope:'同一套完整三章在独立新库人工初始化为 r1/draft；前置核对、进度及旧导出来自所选跨会话 B 的实际结果，不代表读者已执行。'};
await writeFile(`${folder}/task.json`,JSON.stringify(task,null,2));await writeFile(`${folder}/人工初始化完整回执.json`,JSON.stringify(init,null,2));
await writeFile(`${folder}/任务说明.md`,`# 本轮任务：依据实际变化调整计划

作品 ${id}，数据库 ${db}。目标仍为三章待审草稿，PRD C1–C5、完整阶段 P1–P4 沿用 materials 中的示范，不追认为本轮执行过写作阶段。

U 是 materials/访谈-教学构造.md；W 是 materials/作品.json 初始化后经当前 CLI show 读回的 work；R 是同目录真实初始化回执、人工保存返回、当前 CLI show/chapter 和旧交付全文；K 是 README.md 的能力说明及现有 dist/cli.js、dist/store.js。

本库资料 r1，三章起点均 r1/draft、origin=human，没有继承采用或历史任务。完整前置核对、最新进度和旧导出已经复制并核对字节，来源与摘要在 task.json。它们是前一任务的真实记录，不是本库变更后的当前结论。

人工修改按 materials/第二章-人工修改后.md 通过 CLI save 另行保存；当前第二章必须实际读回，不能把拟改文件当作已保存。本轮只允许更新 ${task.plan} 与 ${task.progress}。禁止改写、保存、采用小说或修改代码与数据库，也不更新旧导出，不读取其他项目、个人记忆或私有宿主目录。材料变化的具体影响由完整前后文决定，事实说明没有预先指定必须如何改第三章。
`);
await writeFile(task.progress,`# 当前进度

目标：交三章可连续阅读的待审草稿，沿用 PRD C1–C5；人的文学判断仍未发生。

已实际完成：独立新库 ${db} 初始化为资料 r1、三章 r1/draft；旧导出 ${deliverable} 与本库初始 Store.exportWork 完整字节一致；前置完整核对、进度、旧导出已复制；CLI show 和三章全文已读回。

人工改稿输入已准备在 ${folder}/第二章-人工修改完整输入.json，尚需通过 CLI save 保存并读回。此进度不代替当前业务对象。

尚未完成：变化后关系核对、调整计划、后续必要工作、新当前交付和人的连续阅读。

下一步：人工保存并完整读回第二章，再依据完整资料、三章、旧交付与旧记录调整计划。是否需要修改第三章、修改什么以及交付依赖由实际正文和人的取舍决定。
`);
await writeFile(`${folder}/完整重规划输入.txt`,`请依据这次人工变化调整计划，不执行小说改写或新导出。

完整读取 materials/访谈-教学构造.md、materials/PRD-人工示范.md、materials/阶段计划-人工示范.md、README.md、materials/人工变化说明.md，以及 ${folder}/task.json、任务说明.md、当前进度.md、前置-最新进度.md、前置-完整材料核对.md、第二章-改前全文.md、第二章-人工修改完整输入.json。后几个文件均在 ${folder} 目录内。前置记录中的原任务路径和时间属于历史事实，不直接当作本库最新状态。

通过 node dist/cli.js show 与 chapter 1、2、3 实际取得作品 ${id} 在数据库 ${db} 的当前资料、目录、修订与三章完整正文。实际打开旧交付 ${deliverable}，用现有 Store.exportWork 的完整当前文本作逐字节比较，不调用 CLI export、不覆盖旧文件。不得以摘要、头几行、字符计数、关键词或 basisCurrent 代替完整语义核对。

判断变化影响哪些已经完成的工作、哪些原结论仍可靠、哪些需要重新检查。引用实际前后原句并解释条件；未在正文中写出的事件不能当成已发生。不要预先假定第三章一定错误或一定可以照旧保留。涉及人的文学取舍时列出选择与各自依赖，不代替人决定。

只保存 ${task.plan} 和 ${task.progress}。计划要保留可靠成果，明确先后依赖、下一步对象、证据和负责人；进度区分已有事实、计划中尚未执行的工作与待人的决定。不能把新计划当作第三章已修好、当前交付已更新或人已认可。最后完整读回这两份文件，按实际保存结果报告。不要读取其他项目、个人记忆、账户配置或私有宿主目录。
`);
console.log(JSON.stringify({id,db,folder,cliFullReads:calls,changeNotYetSaved:true,modelTasks:0}));
