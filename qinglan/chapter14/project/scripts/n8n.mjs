import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { root,load,save,sha,configuration,exchange,publicApi,publicRecord,workflowProjection,executionProjection } from '../src/native-rest.mjs';
import { checkSource } from '../src/source.mjs';

const command=process.argv[2], key=process.argv[3];
if(!['prepare','probe','publish','feedback','files','branch','readback'].includes(command)){console.log('命令：prepare、probe、publish、feedback test-E01|production-E01|duplicate-E01|production-E02、files、branch、readback。真正测试监听由浏览器点击。');process.exit(0);}
const source=await checkSource();
const bindingPath='.local/binding.json';
const binding=command==='prepare'?{tables:{},workflows:{},source}:await load(bindingPath);
const index=await load('records/index.json');
const createBody=w=>Object.fromEntries(['name','nodes','connections','settings'].map(k=>[k,w[k]]));
const boundFeedback=async task=>{const w=await load('workflows/feedback/workflow.template.json');for(const n of w.nodes)if(n.parameters.dataTableId)n.parameters.dataTableId.value=n.parameters.dataTableId.value==='__TASK_TABLE_ID__'?binding.tables[task+'Task']:binding.tables[task+'Feedback'];return w;};
const readRows=table=>publicApi('/data-tables/'+table+'/rows?limit=100');
async function manifest(){await save('records/index.json',index);}
async function ensureNew(folder){try{await fs.access(path.join(root,folder));throw new Error('该采集目录已存在，不重新提交；使用 readback 只读回查。');}catch(error){if(error.code!=='ENOENT')throw error;}await fs.mkdir(path.join(root,folder),{recursive:true});await save(folder+'/source.json',source);}
async function rowsSnapshot(name,table){const r=await readRows(table);await publicRecord(name,r);return r.record.body;}
async function executionSnapshot(name,id){
  let last; const until=Date.now()+30000;
  do{last=await publicApi('/executions/'+encodeURIComponent(id)+'?includeData=true&ignoreDataSizeLimit=true');if(['success','error','canceled','crashed'].includes(last.record.body.status))break;await delay(500);}while(Date.now()<until);
  await publicRecord(name,last,executionProjection);return last.record.body;
}
async function postFrozen(folder,inputName,route){const bodyText=await fs.readFile(path.join(root,inputName),'utf8');await fs.writeFile(path.join(root,folder,'input.json'),bodyText);const config=await configuration();const result=await exchange(config.baseUrl,route,'POST',bodyText);await save(folder+'/response.json',result.record);return result.record;}
if(command==='prepare'){
  try{await fs.access(path.join(root,bindingPath));throw new Error('隔离绑定已存在；不重复创建表或流程。');}catch(error){if(error.code!=='ENOENT')throw error;}
  await save(bindingPath,binding);
  for(const table of await load('inputs/五份建表参数.json')){const r=await publicApi('/data-tables','POST',table.request);if(!r.record.body?.id)throw new Error('原生建表没有返回实际 ID。');binding.tables[table.key]=r.record.body.id;await save(bindingPath,binding);const empty=await readRows(r.record.body.id);if(empty.record.body.data.length!==0)throw new Error('新建课堂表并非空表。');await publicRecord('records/preparation/'+table.key+'-empty.json',empty);}
  const feedback=await publicApi('/workflows','POST',createBody(await boundFeedback('test')));binding.workflows.feedback=feedback.record.body.id;await save(bindingPath,binding);await publicRecord('records/preparation/feedback-test-workflow.json',feedback,workflowProjection);
  const file=await publicApi('/workflows','POST',createBody(await load('workflows/files/workflow.json')));binding.workflows.files=file.record.body.id;await save(bindingPath,binding);await publicRecord('records/preparation/files-workflow.json',file,workflowProjection);
  const child=await load('workflows/branch/child.template.json');child.nodes.find(n=>n.name==='保存本轮完整回执').parameters.dataTableId.value=binding.tables.receipts;const childResult=await publicApi('/workflows','POST',createBody(child));binding.workflows.child=childResult.record.body.id;await save(bindingPath,binding);await publicRecord('records/preparation/child-workflow.json',childResult,workflowProjection);
  const parent=await load('workflows/branch/parent.template.json');parent.nodes.find(n=>n.name==='同一次子执行传入全部任务').parameters.workflowId.value=binding.workflows.child;const parentResult=await publicApi('/workflows','POST',createBody(parent));binding.workflows.branch=parentResult.record.body.id;await save(bindingPath,binding);await publicRecord('records/preparation/parent-workflow.json',parentResult,workflowProjection);
  await save('records/preparation/binding.json',{tables:binding.tables,workflows:binding.workflows,source});
}else if(command==='probe'){
  const folder='records/feedback/unpublished-probe';await ensureNew(folder);await postFrozen(folder,'inputs/feedback-E01.json','/webhook/qinglan-ch14-feedback');
}else if(command==='publish'){
  try{await fs.access(path.join(root,'records/preparation/feedback-production-draft.json'));throw new Error('本轮发布原件已存在；先核真实版本，不覆盖原件。');}catch(error){if(error.code!=='ENOENT')throw error;}
  const changed=await publicApi('/workflows/'+binding.workflows.feedback,'PUT',createBody(await boundFeedback('production')));await publicRecord('records/preparation/feedback-production-draft.json',changed,workflowProjection);
  for(const [name,id] of Object.entries(binding.workflows)){const current=await publicApi('/workflows/'+id);const published=await publicApi('/workflows/'+id+'/publish','POST',{versionId:current.record.body.versionId});await publicRecord('records/preparation/'+name+'-publish.json',published,workflowProjection);const back=await publicApi('/workflows/'+id);await publicRecord('records/preparation/'+name+'-published-readback.json',back,workflowProjection);if(back.record.body.activeVersionId!==current.record.body.versionId)throw new Error('已发布版本未对应本次实际草稿：'+name);}
}else if(command==='feedback'){
  const cases={'test-E01':['test','inputs/feedback-test-E01.json','测试 · 第一章E01'],'production-E01':['production','inputs/feedback-E01.json','正式 · 第一章E01'],'duplicate-E01':['production','inputs/feedback-E01.json','串行重复 · 第一章E01'],'production-E02':['production','inputs/feedback-E02.json','课堂失败 · 第三章E02']};
  const spec=cases[key];if(!spec)throw new Error('请选择固定反馈采集任务。');const [tables,inputName,label]=spec;const folder='records/feedback/'+key;await ensureNew(folder);
  const before=key==='duplicate-E01'?await publicApi('/executions?workflowId='+binding.workflows.feedback+'&limit=20'):null;
  const response=await postFrozen(folder,inputName,(tables==='test'?'/webhook-test/':'/webhook/')+'qinglan-ch14-feedback');
  const entry={key,label,input:folder+'/input.json',response:folder+'/response.json',taskReceived:folder+'/task-received.json',receivedReadAt:new Date().toISOString(),taskFinal:folder+'/task-final.json',feedbackFinal:folder+'/feedback-final.json',execution:folder+'/execution.json'};
  await rowsSnapshot(entry.taskReceived,binding.tables[tables+'Task']);await rowsSnapshot(folder+'/feedback-received.json',binding.tables[tables+'Feedback']);
  entry.receivedReadAt=(await load(entry.taskReceived+'.source.json')).startedAt;
  let id=response.body?.executionId;
  if(key==='duplicate-E01'){const beforeIds=new Set(before.record.body.data.map(e=>e.id));let found=[];const until=Date.now()+10000;do{const list=await publicApi('/executions?workflowId='+binding.workflows.feedback+'&limit=20');found=list.record.body.data.filter(e=>!beforeIds.has(e.id));if(found.length)break;await delay(200);}while(Date.now()<until);if(found.length!==1)throw new Error('串行重复未找到唯一新的真实执行；已有任务引用不能代替本次执行。');id=found[0].id;}
  if(!id)throw new Error('入口未返回可核的执行 ID，HTTP 原件已保留。');
  const execution=await executionSnapshot(entry.execution,id);entry.actualExecutionId=id;entry.actualExecutionStatus=execution.status;
  await rowsSnapshot(entry.taskFinal,binding.tables[tables+'Task']);await rowsSnapshot(entry.feedbackFinal,binding.tables[tables+'Feedback']);
  if(key==='production-E01'){const numericId=Number(response.body.executionId);if(Number.isFinite(numericId)){const filter=JSON.stringify({type:'and',filters:[{columnName:'id',condition:'eq',value:numericId}]});const wrong=await publicApi('/data-tables/'+binding.tables.productionTask+'/rows?filter='+encodeURIComponent(filter));entry.incorrectLookup=folder+'/execution-id-as-task-id.json';await publicRecord(entry.incorrectLookup,wrong);}}
  index.feedback.push(entry);await manifest();
}else if(command==='files'){
  const folder='records/files/files-01';await ensureNew(folder);const call=await postFrozen(folder,'inputs/完整两项目录输入.json','/webhook/qinglan-ch14-files');
  // 执行索引可能晚于入口返回可见；以原生接收的完整输入匹配，不依赖两端时间。
  const input=JSON.parse(call.request.bodyText),inputSha256=sha(JSON.stringify(input));let current;
  const until=Date.now()+30000;
  do{
    const list=await publicApi('/executions?workflowId='+binding.workflows.files+'&limit=10'),matches=[];
    for(const entry of list.record.body.data){
      const detail=await publicApi('/executions/'+encodeURIComponent(entry.id)+'?includeData=true&ignoreDataSizeLimit=true');
      const received=detail.record.body.data?.resultData?.runData?.['接收两份目录']?.[0]?.data?.main?.[0]?.[0]?.json?.body;
      if(received?.requestId===input.requestId&&sha(JSON.stringify(received))===inputSha256)matches.push(detail.record.body.id);
    }
    if(matches.length>1)throw new Error('完整文件输入对应多个实际执行；保留原件，不选择其一。');
    if(matches.length===1){current=matches[0];break;}await delay(500);
  }while(Date.now()<until);
  if(!current)throw new Error('文件输入的执行索引尚不可见，原件保留；没有重发POST。');
  await executionSnapshot(folder+'/execution.json',current);
  const reads=await fs.readFile(path.join(root,'.local/file-reads.jsonl'),'utf8');const actual=reads.trim().split('\n').filter(Boolean).map(JSON.parse).filter(r=>Date.parse(r.requestedAt)>=Date.parse(call.startedAt)&&Date.parse(r.requestedAt)<=Date.parse(call.finishedAt));await save(folder+'/actual-file-reads.json',actual);
  index.files={input:folder+'/input.json',response:folder+'/response.json',execution:folder+'/execution.json',fileReads:folder+'/actual-file-reads.json'};await manifest();
}else if(command==='branch'){
  const folder='records/branch/batch-01';await ensureNew(folder);const call=await postFrozen(folder,'inputs/批次完整输入.json','/webhook/qinglan-ch14-batch');
  const rows=call.body;if(!Array.isArray(rows)||rows.length!==3)throw new Error('父流程未返回实际三项回执，原件保留。');
  const parentIds=new Set(rows.map(r=>r.parentExecutionId)),childIds=new Set(rows.map(r=>r.childExecutionId));if(parentIds.size!==1||childIds.size!==1)throw new Error('实际父/子执行 ID 不是各一个，不能声称单次子执行。');
  await executionSnapshot(folder+'/parent-execution.json',[...parentIds][0]);await executionSnapshot(folder+'/child-execution.json',[...childIds][0]);await rowsSnapshot(folder+'/receipt-rows.json',binding.tables.receipts);
  index.branch={input:folder+'/input.json',response:folder+'/response.json',rows:folder+'/receipt-rows.json',parentExecution:folder+'/parent-execution.json',childExecution:folder+'/child-execution.json'};await manifest();
}else if(command==='readback'){
  const folder='records/readback/'+new Date().toISOString().replaceAll(':','-');await ensureNew(folder);for(const [name,id]of Object.entries(binding.tables))await rowsSnapshot(folder+'/'+name+'.json',id);
}
console.log(JSON.stringify({command,key:key||null,source,modelRequests:0,googleRequests:0,notifications:0,recipientCardExecuted:false}));
