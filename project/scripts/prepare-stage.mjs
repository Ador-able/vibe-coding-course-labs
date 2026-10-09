import {randomUUID,createHash} from 'node:crypto';
import {copyFile,mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {parseArgs} from 'node:util';
import {seedPrototype} from './prototype-seed.mjs';

const {values}=parseArgs({options:{id:{type:'string'},folder:{type:'string',default:'task-state'}}});
const root=process.cwd(),id=values.id??randomUUID(),folder=resolve(values.folder),db=resolve('data',`stage-${id}.sqlite`);
for(const target of [folder,db]){
  try{await access(target);throw new Error(`目标已存在，请另取实验编号与材料目录：${target}`);}
  catch(error){if(error.code!=='ENOENT')throw error;}
}
await mkdir(folder,{recursive:true});
await mkdir(resolve('deliverables'),{recursive:true});
const sources=resolve(root,'fixtures/task-planning');
const copied=[];
for(const name of ['PRD-人工示范.md','阶段计划-人工示范.md']){
  const from=resolve(sources,name),to=resolve(folder,name);await copyFile(from,to);
  const a=await readFile(from),b=await readFile(to);
  if(!a.equals(b))throw new Error(`完整材料复制不一致：${name}`);
  copied.push({name,sha256:createHash('sha256').update(b).digest('hex'),bytes:b.length});
}
// 复用固定 Store 人工导入完整归档正文，不复制旧任务或采用历史。
const seeded=await seedPrototype(db,id);
const manifest={id,db:relative(root,db).replaceAll('\\','/'),folder:relative(root,folder).replaceAll('\\','/'),
  deliverable:`deliverables/${id}-三章待审.md`,review:`${values.folder}/完整材料核对.md`,progress:`${values.folder}/最新进度.md`,
  sourceCodeVersion:'0cb480c4f2fc4acf680d7581617106f85473b28c',scope:seeded.scope,copied};
await writeFile(resolve(folder,'task.json'),JSON.stringify(manifest,null,2));
await writeFile(resolve(folder,'人工初始化完整回执.json'),JSON.stringify(seeded,null,2));
await writeFile(resolve(folder,'任务说明.md'),`# 本轮实际任务：交付三章待审材料\n\n作品：${id}；数据库：${manifest.db}。\n\n## 目标与完整路线\n沿用同目录完整 PRD 与计划 B 的 C1–C5 和 P1–P4。本轮只执行 P4 的材料整理与核对。PRD 中 clocktower 是原归档作品，本轮对象映射为上述新 UUID；正文、当前用途、设定和三章大纲未改写。完整计划保留供判断目标与依赖，不把 P1–P3 追认为旧实验的实际执行计划。\n\n## 当前阶段的实际起点\n三章已有完整正文，来自固定项目携带的既有归档。本轮经 Store 人工初始化：资料 r1，三章均 r1/draft、origin=human，没有旧任务或采用历史。第一章末尾的影子、砖缝和齿轮声是已有归档中的人工改动，本轮不再改稿，也不重做旧续写。初始化回执是本轮事实；原归档 r2/r3/adopted 不能充当本轮实时状态。\n\n## 本轮要做什么\n先读完整目标、完整计划、当前说明、最新进度和真实 Store 对象，取得第 1–3 章完整正文。通过已有 CLI export 取得 ${manifest.deliverable}。再核对整个导出与当前 Store 导出文本相同，保留篇幅、关键设定、人工改动与第二、三章行动之间的具体原句和条件，写入 ${manifest.review}。最后更新 ${manifest.progress}，逐项记录实际证据、未决项和下一步。\n\n## 操作与判断范围\n只使用固定 CLI/Store 读取与导出，和本任务材料目录内的文件。禁止生成、改写、保存或采用新小说正文；禁止改代码、数据库文件和其他项目。不自动发布，不新增业务 tasks 记录。完整核对文件是 AI 整理的证据与解释，不能代替人读稿。导出文件若已经存在，先逐字核对与当前对象：一致则复用，不再导出；不一致要指出具体差别，保持旧文件供比较。\n\n## 仍未决\n是否采用三章、读者年龄、文风、工期仍待人决定；它们不阻塞整理已有待审稿。既有归档中关于故事取舍的提议不能默认为本轮已合并。当前只交待审材料，人的阅读判断没有发生。\n`);
await writeFile(resolve(folder,'最新进度.md'),`# 最新进度\n\n实际起点：已人工导入新作品 ${id}；资料 r1；第 1、2、3 章均 r1/draft。完整回执在同目录“人工初始化完整回执.json”。\n\n当前阶段：P4，整理三章完整待审材料。\n\n已做：人工导入完整归档；复制完整人工 PRD 与计划 B；本轮没有执行 P1–P3，也没有新模型写作。\n\n尚未做：取得并打开 ${manifest.deliverable}；对照真实 Store 核验完整文本；整理 C2/C3 的具体正文关系；向人交付后取得阅读判断。\n\n下一步：先读目标、路线、当前阶段及真实对象；导出后逐字核对，保存 ${manifest.review}，再据实际结果更新本文件。已有文件不能仅凭本进度中的“尚未做”忽略；若实情与记录不同，以当前可核对材料为依据，说明差别。\n\n未决：文学采用、读者年龄、文风、工期均未定。若后续需要写新文字，先让人处理相应选择。\n`);
await writeFile(resolve(folder,'会话A完整输入.txt'),`请完成本轮 P4 的三章待审交付整理。先完整读取 ${manifest.folder}/PRD-人工示范.md、阶段计划-人工示范.md、任务说明.md、最新进度.md 和 task.json，再用已有 CLI show 与 chapter 1、2、3 读取当前对象与完整正文。\n\n当前作品 ${id}；数据库 ${manifest.db}。这是本轮人工导入的现有三章，没有新写小说的任务。只整理已有稿件，不改代码、数据库或正文，不采用、不发布。先按整体目标与依赖判断本阶段可以做什么。若 ${manifest.deliverable} 尚不存在，用一个单独的命令执行 node dist/cli.js export ${manifest.deliverable} --db ${manifest.db} --work ${id}；不要在这个命令中同时更新进度。export 成功后，再另行打开完整文件、用固定 Store exportWork 的完整结果核对逐字一致，然后保存 ${manifest.review} 和 ${manifest.progress}。\n\n核对不能只看计数、名字、basisCurrent 或模型自评。C2/C3 要给完整三章中的相应原句、它们体现的具体关系与还不能判断的部分。材料仍待人阅读选择；不要把教学计划 P1–P3 写成此前真实执行过。CLI show 只列章节元信息，需要 chapter 命令取得完整正文。读文件与命令输出请保证全文可见，不用头几行或摘要代替。最后根据实际保存结果汇报交付材料、当前阶段、未决项和下一步。\n`);
await writeFile(resolve(folder,'会话B完整输入.txt'),`这是同一任务的一个全新会话。请完成 P4 的三章待审交付整理与交接：先完整读取 ${manifest.folder}/PRD-人工示范.md、阶段计划-人工示范.md、任务说明.md、最新进度.md 和 task.json。完整路线用于判断当前阶段和依赖，不要求重做 P1–P3。不要假定进度标签已经反映全部实际文件。\n\n作品 ${id}；数据库 ${manifest.db}。用已有 CLI show 与 chapter 1、2、3 读取当前对象与完整正文，然后实际检查 ${manifest.deliverable}。若已存在，打开全文，并用固定 Store exportWork 的完整文本逐字比较；相同就复用该文件，不再导出，不生成或改写小说。若不相同，保留旧文件并解释实际差别。只整理现有稿件，不改代码、数据库或正文，不采用、不发布。\n\n保存 ${manifest.review}：逐项核对完整目标 C1–C5；提供三章篇幅、已确认设定与具体行动关系、第一章人工改动怎样被第二、三章相容承接的原句，说明这些证据支持什么、不能证明什么。用完整前文和当前真实修订作依据，不能靠名字、计数或 basisCurrent 自评分。没有历史修订对比就不要自称完成历史修改未覆盖的全面审计；本轮只核对复用文本中的具体关系及当前保存依据。\n\n再更新 ${manifest.progress}：写清实际完成、证据位置、当前阶段、仍待人处理的文学选择/未知、下一步及依赖，尤其说明旧进度与实际产物若有不同。本轮没有执行 P1–P3，也不把归档修订或故事取舍提议标成当前已合并。完整材料是供人判断的草稿，C5 的人的实际阅读尚未发生。最后读回两个实际保存的完整文件，报告当前可交付什么和下一步需要谁做什么。你没有上个会话的聊天记录，也不需要以猜测填补；以本轮任务文件与当前实际对象推进。\n`);
console.log(JSON.stringify({manifest,chapters:seeded.chapters.map(ch=>({number:ch.number,revision:ch.revision,status:ch.status,characters:ch.body.length}))}));
