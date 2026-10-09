import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {Store} from '../dist/store.js';

const target='evidence/02-三章接续真实运行';
const db=path.resolve('data/novel.sqlite');
const taskIds=['01c3ac84-3f42-4853-b153-5f896625cfff','b63538fd-0f55-4756-a0e7-fdb467a5f70a'];
await fs.mkdir(target,{recursive:true});
for(const [index,id] of taskIds.entries()){
  for(const file of ['input.json','events.jsonl','report.json','chapter.json','final-response.txt']){
    await fs.copyFile(path.join('runs',id,file),path.join(target,`第${index+2}章-${file}`));
  }
}
for(const file of ['要求更新回执.json','改稿前实际正文.json','编者人工改稿示范.json','人工改稿保存回执.json','人工采用回执.json','第二章独立读回.json','第三章独立读回.json','导出回执.json','三章草稿.md']){
  await fs.copyFile(path.join('data',file),path.join(target,file));
}

const store=new Store(db);
const client=new Client({name:'agent-lab-real-stale-check',version:'0.1.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/mcp.js'),db],stderr:'pipe'});
let stderr='';
transport.stderr?.on('data',chunk=>{stderr+=chunk.toString();});
try{
  const chapters=[1,2,3].map(number=>store.getChapter('clocktower',number));
  assert.deepEqual(chapters.map(chapter=>[chapter.number,chapter.revision,chapter.status]),[[1,3,'adopted'],[2,1,'draft'],[3,1,'draft']]);
  assert.deepEqual(chapters[1].previousRevisions,[{number:1,revision:3}]);
  assert.deepEqual(chapters[2].previousRevisions,[{number:1,revision:3},{number:2,revision:1}]);
  const tasks=taskIds.map(id=>store.getTask(id));
  assert.ok(tasks.every(task=>task.state==='completed'&&task.threadId==='01a0fbde-cf97-7792-97b0-3618469f1835'));
  const exported=store.exportWork('clocktower');
  const actualText=await fs.readFile('data/三章草稿.md','utf8');
  assert.equal(exported.allOutlineChaptersSaved,true);
  assert.ok(exported.chapters.every(chapter=>chapter.basisCurrent));
  assert.equal(actualText,exported.text);
  for(const chapter of chapters)assert.ok(actualText.includes(chapter.body));
  assert.ok(actualText.includes(chapters[0].reviewNote));

  // 使用当时的真实改稿提议；当前正文已是 r3，失败不得改写已有成果。
  await client.connect(transport);
  const proposal=JSON.parse(await fs.readFile('data/编者人工改稿示范.json','utf8'));
  const failure=await client.callTool({name:'save_draft',arguments:proposal});
  assert.equal(failure.isError,true);
  assert.match(JSON.stringify(failure.content),/STALE_CHAPTER/);
  const after=await client.callTool({name:'read_chapter',arguments:{workId:'clocktower',chapterNumber:1}});
  assert.deepEqual(after.structuredContent.result,chapters[0]);
  await fs.writeFile(path.join(target,'真实过期改稿被拒绝.json'),JSON.stringify({proposal,failure,currentAfterFailure:after.structuredContent.result,unchanged:true},null,2));
  await fs.writeFile(path.join(target,'归档时真实状态.json'),JSON.stringify({archiveCodeVersion:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),work:store.getWork('clocktower'),workHistory:[1,2].map(revision=>store.getWorkVersion('clocktower',revision)),chapters,tasks,exportSummary:{...exported,text:undefined},manualEntry:'编者设计并执行人工入口示范，不冒称真实用户的文学采用。',limits:'已核对真实保存、修订、接续与导出；未测试全部中断位置、异常退出、并发竞争或模型文学品质。'},null,2));
}finally{
  await client.close();
  store.close();
  await fs.writeFile(path.join(target,'过期提议服务stderr.txt'),stderr,'utf8');
}
console.log(JSON.stringify({archive:target,taskIds,chapters:3,currentRevisions:[3,1,1],staleProposalRejected:true}));
