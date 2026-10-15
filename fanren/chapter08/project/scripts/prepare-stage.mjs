import {randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {parseArgs} from 'node:util';
import {seedPrototype} from './prototype-seed.mjs';
import {getCodeVersion} from '../dist/version.js';

const {values}=parseArgs({options:{folder:{type:'string',default:'task-state'}}});
const root=process.cwd(),id='fanren',runId=randomUUID(),folder=resolve(values.folder),db=resolve('data','fanren',`cross-${runId}.sqlite`);
for(const target of [folder,db]){try{await access(target);throw new Error(`目标已存在，请另取材料目录：${target}`);}catch(error){if(error.code!=='ENOENT')throw error;}}
await mkdir(folder,{recursive:true});await mkdir(resolve('deliverables'),{recursive:true});
const materials=[];
for(const name of ['作品.json','第一章.md','第二章.md','第三章.md','访谈-教学构造.md','PRD-人工示范.md','阶段计划-人工示范.md']){
  const bytes=await readFile(resolve('materials',name));materials.push({path:`materials/${name}`,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
const seeded=await seedPrototype(db,id);
const manifest={id,runId,db:relative(root,db).replaceAll('\\','/'),folder:relative(root,folder).replaceAll('\\','/'),deliverable:`deliverables/cross-${runId}-三章待审.md`,review:`${values.folder}/完整材料核对.md`,progress:`${values.folder}/最新进度.md`,codeVersion:getCodeVersion(),materials,scope:seeded.scope};
const save=(name,text)=>writeFile(resolve(folder,name),text,'utf8');
await save('task.json',JSON.stringify(manifest,null,2));await save('人工初始化完整回执.json',JSON.stringify(seeded,null,2));
await save('任务说明.md',`# 本轮任务：整理三章待审材料

作品为 ${id}，数据库为 ${manifest.db}。目标使用 materials/PRD-人工示范.md 的 C1–C5，完整路线使用 materials/阶段计划-人工示范.md 的 P1–P4。本轮已有完整三章，只执行 P4 的核对与交付，不重新生成小说。

## 来源代号与可读对象
- U：materials/访谈-教学构造.md，教师构造的完整访谈，不是真实使用者访谈。
- W：materials/作品.json 提供初始化内容；当前资料以 node dist/cli.js show --db ${manifest.db} --work ${id} 实际返回的 work 为准。
- R：${manifest.folder}/人工初始化完整回执.json 是本轮实际初始化返回；当前正文、修订和状态以 CLI show 与 chapter 1、2、3 实际读回为准。后续导出是否存在、全文是否一致须实际检查。
- K：README.md 的现有能力说明及 dist/cli.js、dist/store.js；CLI/Store 负责业务读写，官方 Codex SDK 负责会话，不另建工具循环。

## 实际起点与范围
资料 r1，三章均 r1/draft、origin=human，没有继承第七章的修订、采用或模型任务。三章依次为 C03/C04/C05 完整原文片段；教学编号不等于原书章号，未发生本轮人工改稿。P1–P3 只说明完整路线，不追认为本轮执行过。

只整理当前已存稿件，禁止生成、改写、保存、采用或发布小说，禁止修改代码和业务库。允许用已有 CLI 读取与导出，只在本任务目录保存核对、进度以及指定交付文件。模型没有理由读取其他项目、个人记忆、账户配置或私有运行目录。

## 交付与未决项
取得 ${manifest.deliverable}，以 Store.exportWork 的完整文本逐字节核对。文件已存在且一致时复用，不再导出；不一致时保留旧文件并说明差别。把设定、人工改动与三章行动关系的具体原句和解释写入 ${manifest.review}，再按实际文件更新 ${manifest.progress}。

没有历史修订对比时，不声称审计过全部历史改动。basisCurrent 只反映保存依据，不能证明语义正确。读者年龄、文风、工期未定；整理已有待审稿不依赖这些选择。人的连续阅读与文学认可没有发生。
`);
await save('最新进度.md',`# 最新进度

当前阶段：P4，整理三章完整待审材料。

已实际完成：人工导入作品 ${id}（${manifest.db}），资料 r1，三章 r1/draft；完整初始化返回见人工初始化完整回执.json。没有本轮小说生成、采用或 P1–P3 执行。

尚未完成：取得并打开 ${manifest.deliverable}；逐字节对照当前 Store 导出；保存完整材料核对与本进度更新；将待审材料交给人连续阅读。

下一步：完整读取目标、路线、任务说明和当前业务对象，再根据实际文件推进。若本记录与已有文件不同，以当前可核对材料为准。

未决：文学取舍、读者年龄、文风与工期。整理既有材料不等待这些选择；新增或改写小说需要相应的明确决定。
`);
const shared=`完整读取 materials/访谈-教学构造.md、materials/PRD-人工示范.md、materials/阶段计划-人工示范.md、README.md、${manifest.folder}/任务说明.md、${manifest.progress} 和 ${manifest.folder}/task.json。然后使用现有 CLI show 与 chapter 1、2、3 取得当前资料、目录和三章完整正文。作品 ${id}；数据库 ${manifest.db}。\n\n本轮只整理既有稿件，禁止生成或修改小说、修改代码与业务库、采用或发布。不要读取其他项目、个人记忆、账户配置和私有宿主目录。P1–P3 是完整路线，不是本轮已执行事实。读文件与命令结果需要全文，不以摘要或头几行代替。\n\n`;
const ending=`核对 PRD 的 C1–C5，记录篇幅、已确认设定、考核规则与结果、进入神手谷的前后衔接，并引用对应原句，说明能支持和不能支持的判断。不得凭数量、名字、basisCurrent 或模型自评判定三章通过；本轮没有人工改前改后对比，不把原文衔接称人工改稿生效；没有历史修订对比就不宣称审计全部历史变更。人的连续阅读和文学认可仍未发生。\n\n保存 ${manifest.review}，再更新 ${manifest.progress}，明确完成证据、未决项、下一步和负责人；最后读回这两份完整文件。`;
await save('会话A完整输入.txt',`请完成本轮 P4 三章待审材料整理。\n\n${shared}若 ${manifest.deliverable} 尚不存在，用一个单独命令执行 node dist/cli.js export ${manifest.deliverable} --db ${manifest.db} --work ${id}，不要在该命令同时更新进度或核对文件。导出成功后，另行打开完整文件，用固定 Store.exportWork 的完整文本逐字节核对。若文件已存在则先核对，一致时复用，不重复导出。\n\n${ending}\n`);
await save('会话B完整输入.txt',`这是同一任务的新会话，没有上一会话的聊天。请继续完成 P4 三章待审材料整理。\n\n${shared}实际检查 ${manifest.deliverable}，不要只依据进度中的标签。若已存在，打开全文并用固定 Store.exportWork 的完整文本逐字节比较；一致就复用文件，不再次导出。不一致则保留旧文件，指出具体差别及下一步。没有现成文件时才按任务说明取得交付。\n\n${ending}\n`);
console.log(JSON.stringify({manifest,chapters:seeded.chapters.map(ch=>({number:ch.number,revision:ch.revision,status:ch.status})),modelTasks:0}));
