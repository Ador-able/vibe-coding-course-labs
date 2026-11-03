import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import express from 'express';
import { Store } from '../lessons/chapter05/project/src/store.ts';
import { createApp } from '../labs/requests/src/server.ts';
import type { HumanRun } from '../labs/requests/src/human-decisions/contract.ts';

async function listen(server:Server) { server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address!=='string');return `http://127.0.0.1:${address.port}`; }
async function close(server:Server){server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}

test('人的回答与新要求接续原任务，采用绑定当前稿；审批改参后旧批准失效，并发接续只执行一次',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'human-decisions-')),project=join(directory,'project'),records=join(directory,'runs');
  await mkdir(project);await copyFile('lessons/chapter05/human-decisions/materials.json',join(project,'materials.json'));
  const options=[{id:'A',label:'以岳堂主宣布正午时限开场，先建立目标与压力，再交代韩立离家的原因。'},{id:'B',label:'以韩立回想父亲盘算收入的场景开场，先建立来意，再转入眼前考核。'}];
  const draft={title:'家里的盼头',body:'韩立想起父亲听说入门有收入时的神情。\n\n眼前的竹林挡住了去路，他扶着竹子继续往上走。'};
  const oldOptions=/从来到竹林开始|从竹林喘息开始/;
  const requests:any[]=[];let proposals=0, failNextProposal=false;
  const upstream=createServer(express().use(express.json({limit:'1mb'})).post('/chat/completions',(req,res)=>{
    const data=req.body;requests.push(data);assert.equal(data.max_tokens,undefined);assert.equal(data.max_completion_tokens,undefined);
    const messages=data.messages,results=messages.filter((item:any)=>item.role==='tool');
    const has=(id:string)=>results.some((item:any)=>item.tool_call_id===id);
    const output=(id:string)=>JSON.parse(results.find((item:any)=>item.tool_call_id===id).content);
    const call=(id:string,name:string,input:unknown)=>({id,type:'function',function:{name,arguments:JSON.stringify(input)}});
    const lastUser=messages.filter((item:any)=>item.role==='user').at(-1).content;
    let calls:unknown[]=[],text:string|null=null;
    if(!data.tools?.length)text='已经处理本次决定。';
    else if(lastUser.startsWith('请提议以下 save_draft')){
      assert.equal(data.tool_choice,'auto');
      if(failNextProposal){failNextProposal=false;res.status(400).json({error:{message:'unsupported tool choice; credential human-test-secret; Authorization: Bearer other-secret',type:'invalid_request_error'}});return;}
      const input=JSON.parse(lastUser.slice(lastUser.indexOf('\n')+1));calls=[call('proposal-'+(++proposals),'save_draft',input)];
    }
    else if(has('saved-read')){assert.equal(output('saved-read').chapter.body,draft.body);text='第一章已保存为草稿。';}
    else if(has('saved'))calls=[call('saved-read','read_chapter',{})];
    else if(has('fresh-work')){assert.equal(output('fresh-work').revision,2);assert.equal(output('fresh-work').requirements.at(-1),'人的叙事切入决定：'+options[1].label);calls=[call('saved','save_draft',{workId:'fanren',chapterNumber:1,expectedWorkRevision:2,expectedChapterRevision:0,expectedPreviousRevisions:[],...draft})];}
    else if(has('question')){assert.deepEqual(output('question'),{id:'B',text:options[1].label,workRevision:2});calls=[call('fresh-work','read_work',{})];}
    else if(has('work')&&has('chapter')){
      assert.doesNotMatch(lastUser,oldOptions);assert.doesNotMatch(JSON.stringify(output('work')),oldOptions);
      for(const option of options){assert.ok(!lastUser.includes(option.label));assert.ok(!JSON.stringify(output('work')).includes(option.label));}
      calls=[call('question','ask_direction',{question:'哪种开场更符合你想要的叙事重心？',options})];
    }
    else calls=[call('work','read_work',{}),call('chapter','read_chapter',{})];
    res.json({id:'reply-'+requests.length,object:'chat.completion',created:1,model:'test-model',choices:[{index:0,finish_reason:calls.length?'tool_calls':'stop',message:{role:'assistant',content:text,...(calls.length?{tool_calls:calls}:{})}}],usage:{prompt_tokens:100,completion_tokens:20}});
  }));
  const upstreamUrl=await listen(upstream);
  const app=createApp({API_BASE_URL:upstreamUrl,API_KEY:'human-test-secret',MODEL:'test-model'},()=>{},undefined,{disclosure:{projectDirectory:project,recordDirectory:join(directory,'disclosure')},tasks:{projectDirectory:project,recordDirectory:join(directory,'tasks')},humanDecisions:{projectDirectory:project,recordDirectory:records}});
  const server=createServer(app),origin=await listen(server);
  const get=async(id:string)=>await(await fetch(`${origin}/api/human-decisions/runs/${id}`)).json() as HumanRun;
  const post=async(path:string,body:unknown)=>{const response=await fetch(origin+'/api/human-decisions/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,value:await response.json()};};
  const finish=async(value:HumanRun)=>{const deadline=Date.now()+10000;while(value.state==='running'){assert.ok(Date.now()<deadline,'运行没有结束');await new Promise(resolve=>setTimeout(resolve,20));value=await get(value.id);}return value;};
  const mutate=async(run:HumanRun,name:string,body:object)=>await post(`runs/${run.id}/${name}`,{revision:run.revision,...body});
  const actual=(run:HumanRun)=>{const store=new Store(join(records,run.id,'work.sqlite'));try{return {work:store.getWork(run.work.id),chapter:store.getChapter(run.work.id,1)};}finally{store.close();}};
  try{
    const materials=await(await fetch(origin+'/api/human-decisions/materials')).json();assert.equal((await fetch(origin+'/api/human-decisions/classroom')).status,404);
    const source=JSON.parse(await readFile('lessons/chapter05/tools/materials/initial-work.json','utf8'));
    assert.equal(materials.materials.work.facts.at(-1),source.facts[2]);assert.equal(materials.materials.work.outline.length,1);
    const initial=await post('run',{phase:'direction'});assert.equal(initial.status,202);let direction=await finish(initial.value);
    assert.equal(direction.state,'awaiting-direction');assert.equal(actual(direction).chapter,null);assert.equal(direction.question!.toolCallId,'question');assert.deepEqual(direction.question!.options,options);
    assert.deepEqual((await(await fetch(origin+'/api/human-decisions/current?phase=direction')).json()).question,direction.question);
    const answered=await mutate(direction,'answer',{toolCallId:'question',choice:'B'});assert.equal(answered.status,202);direction=await finish(answered.value);
    assert.equal(direction.state,'completed',direction.error);assert.equal(actual(direction).work.revision,2);assert.equal(actual(direction).work.requirements.at(-1),'人的叙事切入决定：'+options[1].label);assert.equal(actual(direction).chapter!.body,draft.body);
    for(const call of direction.calls.filter(item=>item.state==='completed')){const echoed=direction.requests.flatMap(request=>JSON.parse(request.body).messages).find(message=>message.role==='tool'&&message.tool_call_id===call.id);assert.ok(echoed);assert.deepEqual(JSON.parse(echoed.content),call.output);}
    let result=await mutate(direction,'adopt',{chapterRevision:direction.readBack!.revision,note:'测试采用当前内容'});assert.equal(result.status,200);direction=result.value;assert.equal(actual(direction).chapter!.status,'adopted');const oldAdoptRevision=direction.readBack!.revision;
    result=await mutate(direction,'edit',{chapterRevision:oldAdoptRevision,title:direction.readBack!.title,body:direction.readBack!.body+'\n\n他回头看了师兄一眼。'});assert.equal(result.status,200);direction=result.value;assert.equal(actual(direction).chapter!.status,'draft');
    result=await mutate(direction,'adopt',{chapterRevision:oldAdoptRevision});assert.equal(result.status,409);assert.equal(result.value.code,'STALE_CHAPTER');direction=await get(direction.id);assert.equal(actual(direction).chapter!.status,'draft');assert.equal(direction.events.at(-1)!.kind,'adopt-rejected');
    const proposed=await post('run',{phase:'approval',input:materials.materials.actions.C});assert.equal(proposed.status,202);let approval=await finish(proposed.value);assert.equal(approval.state,'awaiting-approval',approval.error);const c=approval.pending!;
    assert.equal(actual(approval).chapter,null);result=await mutate(approval,'decide',{approvalId:c.approvalId,approved:true,reason:'核对后批准C'});assert.equal(result.status,200);approval=result.value;assert.equal(actual(approval).chapter,null);assert.equal(approval.state,'decision-recorded');
    result=await mutate(approval,'replace',{approvalId:c.approvalId,input:materials.materials.actions.D});assert.equal(result.status,202);approval=await finish(result.value);assert.equal(approval.state,'awaiting-approval',approval.error);assert.notEqual(approval.pending!.approvalId,c.approvalId);assert.notEqual(approval.pending!.toolCallId,c.toolCallId);assert.equal(actual(approval).chapter,null);
    const replacement=JSON.parse(approval.requests.at(-1)!.body).messages;
    const oldCallIndex=replacement.findIndex((message:any)=>message.role==='assistant'&&message.tool_calls?.some((call:any)=>call.id===c.toolCallId));
    const denialIndex=replacement.findIndex((message:any)=>message.role==='tool'&&message.tool_call_id===c.toolCallId);
    const newInputIndex=replacement.findLastIndex((message:any)=>message.role==='user');
    assert.ok(oldCallIndex>=0&&denialIndex>oldCallIndex&&newInputIndex>denialIndex,'旧调用必须先收到拒绝结果，再接收新参数');
    assert.match(replacement[denialIndex].content,/人撤回原提议/);
    const denied=approval.messages.flatMap(message=>message.role==='tool'?message.content:[]).filter(part=>part.type==='tool-result'&&part.toolCallId===c.toolCallId);
    assert.equal(denied.length,1);assert.equal(denied[0].type==='tool-result'&&denied[0].output.type,'execution-denied');
    const count=requests.length;result=await mutate(approval,'resume',{approvalId:c.approvalId});assert.equal(result.status,409);assert.equal(result.value.code,'APPROVAL_NOT_CURRENT');assert.equal(requests.length,count);approval=await get(approval.id);
    const d=approval.pending!;result=await mutate(approval,'decide',{approvalId:d.approvalId,approved:true,reason:'核对新参数后批准D'});assert.equal(result.status,200);approval=result.value;
    const continuations=await Promise.all([mutate(approval,'resume',{approvalId:d.approvalId}),mutate(approval,'resume',{approvalId:d.approvalId})]);assert.deepEqual(continuations.map(item=>item.status).sort(),[202,409]);approval=await finish(continuations.find(item=>item.status===202)!.value);
    assert.equal(approval.state,'completed',approval.error);assert.equal(actual(approval).chapter!.body,materials.materials.actions.D.body);assert.equal(approval.events.filter(item=>item.kind==='actual-save').length,1);
    assert.equal(approval.events.find(item=>item.kind==='human-approval')!.value && (approval.events.find(item=>item.kind==='human-approval')!.value as any).readBackBeforeExecution,null);
    assert.deepEqual(JSON.parse(await readFile(join(records,approval.id,'run.json'),'utf8')),approval);assert.ok(!JSON.stringify(approval).includes('human-test-secret'));
    const classroom={version:1,direction,approval};await writeFile(join(project,'classroom.json'),JSON.stringify(classroom));const before=requests.length;assert.deepEqual(await(await fetch(origin+'/api/human-decisions/classroom')).json(),classroom);assert.equal(requests.length,before);
    failNextProposal=true;
    const invalid=await finish((await post('run',{phase:'approval',input:materials.materials.actions.C})).value);
    assert.equal(invalid.state,'failed');assert.equal(actual(invalid).chapter,null);
    assert.equal(invalid.requests[0].httpStatus,400);
    assert.match(JSON.stringify(invalid.requests[0].response),/unsupported tool choice/);
    assert.ok(!JSON.stringify(invalid).includes('human-test-secret'));assert.ok(!JSON.stringify(invalid).includes('other-secret'));
  }finally{await app.closeTools();await close(server);await close(upstream);assert.ok(resolve(directory).startsWith(resolve(tmpdir())));await rm(directory,{recursive:true,force:true});}
});
