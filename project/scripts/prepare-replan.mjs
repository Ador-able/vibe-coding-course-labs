import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,access,copyFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {seedPrototype} from './prototype-seed.mjs';
import {Store} from '../dist/store.js';

const {values}=parseArgs({options:{id:{type:'string'},folder:{type:'string',default:'replanning-state'}}});
const id=values.id??randomUUID(),folder=values.folder,db=`data/replan-${id}.sqlite`;
for(const target of [folder,db]){try{await access(target);throw new Error(`目标已存在，请另取实验编号与目录：${target}`);}catch(error){if(error.code!=='ENOENT')throw error;}}
await mkdir(folder,{recursive:true});await mkdir('deliverables',{recursive:true});
const prior=JSON.parse(await readFile('task-state/人工初始化完整回执.json','utf8'));
const init=await seedPrototype(resolve(db),id);
for(const ch of init.chapters){const old=prior.chapters.find(x=>x.number===ch.number);assert.equal(ch.body,old.body);assert.equal(ch.title,old.title);}
const files={'PRD-人工示范.md':'fixtures/replanning/PRD-人工示范.md','阶段计划-人工示范.md':'fixtures/replanning/阶段计划-人工示范.md','前置-最新进度.md':'fixtures/replanning/前置-最新进度.md','前置-完整材料核对.md':'fixtures/replanning/前置-完整材料核对.md'};
const copied=[];
for(const [name,from] of Object.entries(files)){const to=`${folder}/${name}`;await copyFile(from,to);const a=await readFile(from),b=await readFile(to);assert.ok(a.equals(b));copied.push({name,from,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}
const deliverable=`deliverables/${id}-旧三章待审.md`,oldDelivery='fixtures/replanning/旧三章待审.md';
await copyFile(oldDelivery,deliverable);
const store=new Store(resolve(db));try{assert.ok((await readFile(deliverable)).equals(Buffer.from(store.exportWork(id).text,'utf8')));}finally{store.close();}
const calls=[];
// 用实际 CLI 全文读回生成修改输入，不从旧修订标签拼参数。
for(const args of [['show'],['chapter','1'],['chapter','2'],['chapter','3']]){
  const result=execFileSync(process.execPath,['dist/cli.js',...args,'--db',db,'--work',id],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const path=`${folder}/改前-${args.join('-')}.json`;await writeFile(path,result);calls.push({args,output:path});
}
const show=JSON.parse(await readFile(`${folder}/改前-show.json`,'utf8')),chapter=JSON.parse(await readFile(`${folder}/改前-chapter-2.json`,'utf8'));
const marker='林澈收起螺丝刀，将灯留在原处。',start=chapter.body.indexOf(marker);assert.ok(start>=0);assert.equal(chapter.body.indexOf(marker,start+1),-1);
const ending='林澈把铁盖装回，逐颗拧好螺丝，合上工具箱。\n\n“先把这里记下来。午后再来，看清它怎么动。”\n\n周伯收起窗台上的灯，领着他下楼。塔门锁好后，林澈站在街边，重新看了一眼笔记里的小点。他和周伯约好了午后在这里碰面，没有再回钟室。';
const proposal={workId:id,chapterNumber:2,expectedWorkRevision:show.work.revision,expectedChapterRevision:chapter.revision,expectedPreviousRevisions:show.chapters.filter(ch=>ch.number<2).map(ch=>({number:ch.number,revision:ch.revision})),title:chapter.title,body:chapter.body.slice(0,start)+ending};
await writeFile(`${folder}/第二章-人工修改完整输入.json`,JSON.stringify(proposal,null,2));
await writeFile(`${folder}/第二章-改前全文.md`,chapter.body);await writeFile(`${folder}/第二章-拟改后全文.md`,proposal.body);
await writeFile(`${folder}/人工变化说明.md`,`# 教学构造的人工变化\n\n这不是实际使用者访谈，也不是模型生成。教师为观察前文变化对后续任务的影响，准备一次具体人工修改：保留第二章前面全部文字，只将结尾改为收盖、收灯、下楼，并约午后再来。第一章已有早市与师父清早委托的文字；午后安排发生在这些事件之后。资料、大纲和本轮三章待审目标不变。\n\n修改尚未保存时以实际 CLI 读回为准；本文件不是新修订证明。完整修改输入含由本轮实际读取取得的基线，必须通过已有 CLI save 保存并再读回。第三章保持完整原稿供检查，不预先指定它必错、必须重写某句或必须何时导出。需要观察的是真实前后文支持哪些关系、哪些旧核对结论要重新检查、有哪些文学选择仍待人。\n\n旧交付全文保留供对照，不把更新进度当成已更新交付，也不把 basisCurrent 当语义结论。\n`);
const task={id,db,folder,deliverable,review:`${folder}/前置-完整材料核对.md`,progress:`${folder}/当前进度.md`,plan:`${folder}/调整后的计划.md`,oldProgress:`${folder}/前置-最新进度.md`,sourceCommit:'57e31e59c054bd18bd41d0e7f407e648faeeb4e5',oldWorkId:prior.work.id,copied,scope:'固定前置的全部三章经 Store 在本轮新 UUID 库人工初始化；保留前章完整进度/核对及旧导出作为历史对照，不冒充本轮执行记录。'};
await writeFile(`${folder}/task.json`,JSON.stringify(task,null,2));await writeFile(`${folder}/人工初始化完整回执.json`,JSON.stringify(init,null,2));
const template=await readFile('fixtures/replanning/重规划输入模板.txt','utf8');
await writeFile(`${folder}/完整重规划输入.txt`,template.replaceAll('{{folder}}',folder).replaceAll('{{workId}}',id).replaceAll('{{db}}',db).replaceAll('{{deliverable}}',deliverable));
await writeFile(task.progress,`# 当前进度\n\n当前目标：沿用人工 PRD 的 C1–C5，交三章可连续阅读的待审草稿，不是已认可成稿。前置完整路线 P1–P4 保留供定位，不追认本轮执行过 P1–P3。\n\n实际起点：本轮作品 ${id}，数据库 ${db}。完整三章已人工初始化为 r1/draft，当前资料 r1，origin=human，无旧任务或采用历史。与固定前置各章完整正文相同；已有旧导出在 ${deliverable}，本轮复制后已与当前 Store 完整文本逐字节核对一致。前置最新进度、具体核对记录中的旧 UUID 与日期保留，属于前章记录，不能直接当本轮实时状态。\n\n已实际完成：初始化、完整材料复制、CLI show 与三章全文读回；人工变化仅准备完整输入，尚需实际保存和读回。\n\n尚未完成：变化后关系核对、调整计划、按新计划执行必要工作、更新当前待审交付、人的连续阅读与文学判断。是否需要改第三章、改什么和后续依赖以完整实际材料决定。\n\n下一步：通过已有人工 save 保存准备输入，完整读回；让 AI 完整取得目标、路线、旧进度、旧核对、旧导出及当前三章，再依据实际差别调整计划。不得仅凭计数、基线标记或旧完成标签断言语义一致。\n`);
console.log(JSON.stringify({id,db,folder,chapter2BeforeUtf16:chapter.body.length,proposalUtf16:proposal.body.length,cliFullReads:calls,changeNotYetSaved:true}));
