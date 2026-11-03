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
import { TASKS, type Run, type Scenario } from '../labs/requests/src/agent-stopping/contract.ts';
import { WRITE_FAILURE } from '../labs/requests/src/agent-stopping/workspace.ts';

async function listen(server:Server){server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address!=='string');return `http://127.0.0.1:${address.port}`;}
async function close(server:Server){server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}

test('真实工具状态区分完成、待决、写入故障与限额；原问题接续累计预算，取消和服务异常保留实际副作用',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'agent-stopping-')),project=join(directory,'materials'),records=join(directory,'runs');
  await mkdir(project);await copyFile('lessons/chapter05/agent-stopping/materials.json',join(project,'materials.json'));
  const requests:any[]=[],held=new Set<string>(),options=[{id:'A',label:'由家人的盼望切入，先建立来意。'},{id:'B',label:'由正午规则切入，先建立时限压力。'}];
  const upstream=createServer(express().use(express.json({limit:'1mb'})).post('/chat/completions',(req,res)=>{
    const data=req.body;requests.push(data);assert.equal(data.max_tokens,undefined);assert.equal(data.max_completion_tokens,undefined);
    const messages=data.messages,task=messages.find((item:any)=>item.role==='user').content,results=messages.filter((item:any)=>item.role==='tool');
    const has=(id:string)=>results.some((item:any)=>item.tool_call_id===id);
    const output=(id:string)=>JSON.parse(results.find((item:any)=>item.tool_call_id===id).content);
    const call=(id:string,name:string,input:unknown)=>({id,type:'function',function:{name,arguments:JSON.stringify(input)}});
    let calls:unknown[]=[],text:string|null=null;
    if(task.includes('写前取消')&&has('work')||task.includes('超时不返回')||task.includes('写后取消')&&has('saved')){held.add(task);return;}
    if(task.includes('写后异常')&&has('saved')){res.status(500).json({error:{message:'模型服务受控测试错误'}});return;}
    if(has('read-saved'))text='草稿已保存并读回，仍需作者判断。';
    else if(has('saved')){
      const saved=results.find((item:any)=>item.tool_call_id==='saved').content;
      if(saved.includes('课堂受控写入故障'))text='章节写入持续不可用，需要修复写入条件，不能把提议正文当作保存结果。';
      else calls=[call('read-saved','read_chapter',{})];
    }else if(has('question')&&!has('fresh'))calls=[call('fresh','read_work',{})];
    else if(has('work')&&has('chapter')){
      const work=output(has('fresh')?'fresh':'work'),chapter=output('chapter').chapter;
      if(!has('fresh')&&work.requirements.some((item:string)=>item.startsWith('开篇叙事方式由作者决定'))){
        assert.doesNotMatch(JSON.stringify(work),/从来到竹林开始|从竹林喘息开始/);
        calls=[call('question','ask_direction',{question:'希望怎样组织开篇？',options})];
      }else{
        if(has('fresh'))assert.match(work.requirements.at(-1),/人的叙事切入决定：/);
        calls=[call('saved','save_draft',{workId:work.id,chapterNumber:1,expectedWorkRevision:work.revision,expectedChapterRevision:chapter?.revision??0,expectedPreviousRevisions:[],title:'选拔开端',body:'韩立想着父亲的盼望，扶住竹子继续前行。'})];
      }
    }else calls=[call('work','read_work',{}),call('chapter','read_chapter',{})];
    res.json({id:'reply-'+requests.length,object:'chat.completion',created:1,model:'test-model',choices:[{index:0,finish_reason:calls.length?'tool_calls':'stop',message:{role:'assistant',content:text,...(calls.length?{tool_calls:calls}:{})}}],usage:{prompt_tokens:100,completion_tokens:20}});
  }));
  const upstreamUrl=await listen(upstream),app=createApp({API_BASE_URL:upstreamUrl,API_KEY:'stopping-test-key',MODEL:'test-model'},()=>{},undefined,{
    disclosure:{projectDirectory:project,recordDirectory:join(directory,'disclosure')},tasks:{projectDirectory:project,recordDirectory:join(directory,'tasks')},agentStopping:{projectDirectory:project,recordDirectory:records},
  });
  const server=createServer(app),origin=await listen(server);
  const get=async(id:string)=>await(await fetch(`${origin}/api/agent-stopping/runs/${id}`)).json() as Run;
  const post=async(path:string,body:unknown)=>{const response=await fetch(origin+'/api/agent-stopping/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,value:await response.json()};};
  const finish=async(run:Run)=>{const deadline=Date.now()+10000;while(run.state==='running'){assert.ok(Date.now()<deadline,run.stage);await new Promise(done=>setTimeout(done,20));run=await get(run.id);}return run;};
  const start=async(scenario:Scenario,task=TASKS[scenario],maxSteps=16,maxSeconds=0)=>{const response=await post('run',{scenario,task,limits:{maxSteps,maxSeconds}});assert.equal(response.status,202);return response.value as Run;};
  const actual=(run:Run)=>{const store=new Store(join(records,run.id,'work.sqlite'));try{return store.getChapter(run.work.id,1);}finally{store.close();}};
  const waitHeld=async(task:string)=>{const deadline=Date.now()+10000;while(!held.has(task)){assert.ok(Date.now()<deadline,'未取得待取消请求');await new Promise(done=>setTimeout(done,20));}};
  try{
    const a=await finish(await start('A'));assert.equal(a.state,'completed',a.error);assert.equal(a.stop!.reason,'task-completed');assert.deepEqual(a.readBack,actual(a));assert.equal(a.initialChapter,null);assert.equal(a.modelSteps,4);
    let b=await finish(await start('B'));assert.equal(b.state,'waiting',b.error);assert.equal(b.stop!.reason,'author-decision');assert.equal(b.readBack,null);assert.equal(actual(b),null);assert.deepEqual(b.question!.options,options);const waiting=b;
    const question=b.question!,answer='先写家人寄望，再用钟声引入考核压力。',priorSteps=b.modelSteps,priorDuration=b.durationMs!;
    const answered=await Promise.all([post(`runs/${b.id}/answer`,{toolCallId:question.toolCallId,answer}),post(`runs/${b.id}/answer`,{toolCallId:question.toolCallId,answer})]);
    assert.deepEqual(answered.map(item=>item.status).sort(),[202,409]);b=await finish(answered.find(item=>item.status===202)!.value);
    assert.equal(b.state,'completed',b.error);assert.ok(b.modelSteps>priorSteps);assert.ok(b.durationMs!>=priorDuration);assert.equal(b.work.requirements.at(-1),'人的叙事切入决定：'+answer);
    assert.ok(b.events.some(item=>item.type==='stopped'&&(item.value as any).state==='waiting'&&(item.value as any).readBack===null));
    const returned=b.requests.flatMap(request=>JSON.parse(request.body).messages).find(message=>message.role==='tool'&&message.tool_call_id===question.toolCallId);
    assert.deepEqual(JSON.parse(returned.content),b.answer);assert.deepEqual(actual(b),b.readBack);
    const c=await finish(await start('C'));assert.equal(c.state,'blocked',c.error);assert.equal(c.stop!.reason,'tool-failure');assert.equal(c.readBack,null);assert.equal(actual(c),null);
    assert.ok(c.calls.some(item=>item.name==='save_draft'&&item.state==='failed'&&item.error?.includes(WRITE_FAILURE)));
    assert.ok(c.requests.some(request=>JSON.parse(request.body).messages.some((message:any)=>message.role==='tool'&&message.content.includes(WRITE_FAILURE))));
    const limited=await finish(await start('A',TASKS.A,1));assert.equal(limited.state,'limited');assert.equal(limited.stop!.reason,'step-limit');assert.equal(limited.requests.length,1);assert.equal(actual(limited),null);
    const bounded=await finish(await start('B',TASKS.B,2));assert.equal(bounded.state,'waiting');
    const noBudget=await finish((await post(`runs/${bounded.id}/answer`,{toolCallId:bounded.question!.toolCallId,choice:'B'})).value);
    assert.equal(noBudget.state,'limited');assert.equal(noBudget.stop!.reason,'step-limit');assert.equal(noBudget.requests.length,2);assert.equal(noBudget.modelSteps,2);assert.equal(actual(noBudget),null);
    const timed=await finish(await start('A','超时不返回',16,1));assert.equal(timed.state,'limited');assert.equal(timed.stop!.reason,'time-limit');assert.equal(actual(timed),null);
    let cancelledRecord:Run|undefined;
    for(const task of ['写前取消','写后取消']){
      let run=await start('cancel',task);await waitHeld(task);
      const cancelled=await Promise.all([post(`runs/${run.id}/cancel`,{}),post(`runs/${run.id}/cancel`,{})]);assert.ok(cancelled.every(item=>item.status===202||item.status===200));run=await finish(await get(run.id));
      assert.equal(run.state,'cancelled');assert.equal(run.stop!.reason,'user-cancel');assert.deepEqual(run.readBack,actual(run));assert.ok(run.initialChapterSource!.file.endsWith('tools/classroom.json'));
      assert.equal(run.events.filter(item=>item.type==='cancel-requested').length,1);
      if(task==='写前取消'){assert.deepEqual(run.initialChapter,run.readBack);assert.equal(run.events.filter(item=>item.type==='saved').length,0);}
      else{assert.equal(run.readBack!.revision,run.initialChapter!.revision+1);assert.notEqual(run.readBack!.body,run.initialChapter!.body);assert.equal(run.events.filter(item=>item.type==='saved').length,1);}
      assert.deepEqual(JSON.parse(await readFile(join(records,run.id,'run.json'),'utf8')),run);assert.ok(!JSON.stringify(run).includes('stopping-test-key'));
      cancelledRecord=run;
    }
    const failed=await finish(await start('cancel','写后异常'));assert.equal(failed.state,'failed');assert.equal(failed.stop!.reason,'model-service');assert.equal(failed.readBack!.revision,2);assert.deepEqual(failed.readBack,actual(failed));
    const classroom={version:1,runs:{A:a,B:waiting,C:c,cancel:cancelledRecord}};await writeFile(join(project,'classroom.json'),JSON.stringify(classroom));const before=requests.length;
    assert.deepEqual(await(await fetch(origin+'/api/agent-stopping/classroom')).json(),classroom);assert.equal(requests.length,before);
    assert.equal((await(await fetch(origin+'/api/agent-stopping/current?scenario=C')).json()).id,c.id);
  }finally{await app.closeTools();await close(server);await close(upstream);assert.ok(resolve(directory).startsWith(resolve(tmpdir())));await rm(directory,{recursive:true,force:true});}
});
