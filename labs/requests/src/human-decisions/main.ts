import '../lab.css';
import '../../../../shared/markdown.css';
import '../tools/style.css';
import './style.css';
import { renderMarkdown } from '../../../../shared/markdown.ts';
import type { ToolDefinition } from '../tools/contract.ts';
import { SECTIONS, type Classroom, type HumanRun, type Materials, type Phase } from './contract.ts';

const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = `<header><h1>人的决定实验</h1><p>作出具体决定，再核对任务依据、当前稿件和实际操作发生了什么变化。</p></header>
  <div class="human-tabs" role="tablist" aria-label="实验环节">${Object.entries(SECTIONS).map(([key,label])=>`<button role="tab" data-section="${key}" aria-selected="${key === 'direction'}">${label}</button>`).join('')}</div>
  <section class="tools-definitions"><h2>工具定义</h2><div id="definitions"></div></section>
  <details id="basis"><summary>任务材料</summary><div id="materials"></div></details>
  <div id="task-box"><label for="task">任务</label><textarea id="task" rows="4" maxlength="12000"></textarea></div>
  <div class="tools-controls"><button id="start" disabled>运行任务</button><button id="stop" class="secondary" hidden>停止</button><button id="classroom" class="secondary" disabled>加载课堂实录</button></div>
  <p id="status" role="status" aria-live="polite"></p><p id="source"></p><section id="result"></section>`;
const get = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
let section: keyof typeof SECTIONS = 'direction', materials: Materials, run: HumanRun | null = null, source = '本机运行', replay: Classroom | null = null, busy = false;
const start = get<HTMLButtonElement>('start'), stop = get<HTMLButtonElement>('stop'), classroom = get<HTMLButtonElement>('classroom'), task = get<HTMLTextAreaElement>('task');
const phase = (): Phase => section === 'approval' ? 'approval' : 'direction';
const status = (message:string) => { get('status').textContent = message; };
async function json<T>(path:string, init?:RequestInit):Promise<T> { const response=await fetch('/api/human-decisions/'+path,init), value=await response.json(); if(!response.ok)throw new Error(value.error || '本机请求未完成。'); return value; }
const post = <T>(path:string, body:unknown) => json<T>(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function markdown(parent:HTMLElement,text:string) { const node=document.createElement('div');renderMarkdown(node,text);parent.append(node);return node; }
function heading(parent:HTMLElement,text:string,tag:'h2'|'h3'|'h4'='h3') { const node=document.createElement(tag);node.textContent=text;parent.append(node); }
function detail(parent:HTMLElement,label:string,key:string,opened:Set<string>) { const node=document.createElement('details'),summary=document.createElement('summary');node.dataset.key=key;summary.textContent=label;node.open=opened.has(key);node.append(summary);parent.append(node);return node; }
function raw(parent:HTMLElement,label:string,value:unknown) { const p=document.createElement('p'),pre=document.createElement('pre');p.textContent=label;pre.textContent=typeof value==='string'?value:JSON.stringify(value,null,2);parent.append(p,pre); }
function button(parent:HTMLElement,label:string,handler:()=>void,secondary=false) { const node=document.createElement('button');node.textContent=label;node.className=secondary?'secondary':'';node.disabled=busy||!!replay;node.onclick=handler;parent.append(node);return node; }
function input(parent:HTMLElement,label:string,value:string,multiline=false) { const id='field-'+Math.random().toString(36).slice(2),title=document.createElement('label');title.htmlFor=id;title.textContent=label; const node=multiline?document.createElement('textarea'):document.createElement('input');node.id=id;node.value=value;parent.append(title,node);return node; }
function workText(work: HumanRun['work']) { return `### ${work.title}\n\n${work.purpose}\n\n${work.requirements.map(item=>'- '+item).join('\n')}\n\n${work.facts.join('\n\n')}\n\n${work.outline.map(item=>`### 第${item.number}章 ${item.titleHint}\n\n${item.goal}`).join('\n\n')}`; }
function chapter(parent:HTMLElement,value:HumanRun['readBack']|undefined,opened:Set<string>,key:string) {
  if(value===undefined) { markdown(parent,'本条记录没有独立读回结果。');return; }
  if(value===null) { markdown(parent,'第一章尚未保存。');return; }
  markdown(parent,`**第1章 ${value.title}** · 正文 r${value.revision} · ${value.status==='adopted'?'已采用这份内容':'草稿，待判断'}`);
  const full=detail(parent,'完整正文',key,opened);markdown(full,value.body);
}
function setBusy(value:boolean) { busy=value;start.disabled=value;classroom.disabled=value;task.disabled=value;stop.hidden=!value;document.querySelectorAll<HTMLButtonElement>('[data-section]').forEach(node=>node.disabled=value); }
async function follow(value:HumanRun) {
  setBusy(true);
  try { while(true){ run=value;render(); if(value.state!=='running')break; status(value.stage+'…');await new Promise(resolve=>setTimeout(resolve,1000));value=await json<HumanRun>('runs/'+value.id); }status(value.error||''); }
  catch(error){status((error as Error).message);}finally{setBusy(false);render();}
}
async function act(name:string,data:unknown) {
  if(!run||replay)return;setBusy(true);status('正在处理…');
  try { await follow(await post<HumanRun>(`runs/${run.id}/${name}`,{revision:run.revision,...data as object})); }
  catch(error){const message=(error as Error).message;run=await json<HumanRun>('runs/'+run.id).catch(()=>run);status(message);setBusy(false);render();}
}
function events(parent:HTMLElement,opened:Set<string>) {
  if(!run)return;heading(parent,'决定与实际变化','h2'); const list=document.createElement('div');list.className='human-events';parent.append(list);
  run.events.forEach((event,index)=>{
    const v=event.value as any;let title='';
    if(section==='direction'&&event.kind==='direction-question')title='模型提出待人选择的问题';
    if(section==='direction'&&event.kind==='direction-answer')title='人的选择写入当前要求';
    if(section==='direction'&&event.kind==='checkpoint'&&v.state==='awaiting-direction')title='等待选择时的独立读回';
    if(section==='direction'&&event.kind==='checkpoint'&&v.readBack)title='接续后的实际要求与保存正文';
    if(section==='adoption'&&event.kind==='human-adopt')title='采用了这份具体稿件';
    if(section==='adoption'&&event.kind==='human-edit')title='内容修改后重新成为草稿';
    if(section==='adoption'&&event.kind==='adopt-rejected')title='旧版本采用请求被拒绝';
    if(section==='approval'&&event.kind==='approval-request')title='新的具体保存请求';
    if(section==='approval'&&event.kind==='human-approval')title=v.decision.approved?'批准已记录，尚未执行':'拒绝已记录';
    if(section==='approval'&&event.kind==='human-replacement')title='原提议撤回，新的参数交给模型';
    if(section==='approval'&&event.kind==='resume-rejected')title='旧批准不能推进当前请求';
    if(section==='approval'&&event.kind==='actual-save')title='保存函数实际执行';
    if(section==='approval'&&event.kind==='checkpoint'&&(v.state==='completed'||v.state==='closed'))title='执行后的程序独立读回';
    if(!title)return; const node=detail(list,title,'event:'+index,opened);node.className='human-event';const body=document.createElement('div');node.append(body);
    if(event.kind==='direction-question')markdown(body,`**${v.question}**\n\n${v.options.map((option:any)=>`${option.id}：${option.label}`).join('\n\n')}`);
    else if(event.kind==='direction-answer') { markdown(body,`选择 ${v.choice.id}：${v.choice.text}\n\n当前要求已更新为 r${v.work.revision}。`);const selected=v.work.requirements.find((item:string)=>item.startsWith('人的叙事切入决定：'));if(selected)markdown(body,selected); }
    else if(event.kind==='checkpoint') { if(v.state==='awaiting-direction')markdown(body,'待答问题已经保留，第一章尚未保存。');else {if(v.work)markdown(body,`当前作品要求 r${v.work.revision}`);if(section==='direction'&&v.readBack)markdown(body,v.readBack.body.trim().split(/\n\s*\n/)[0]);chapter(body,v.readBack,opened,'checkpoint:'+index);} }
    else if(event.kind==='human-edit'||event.kind==='human-adopt')chapter(body,v.saved,opened,'chapter-event:'+index);
    else if(event.kind.endsWith('-rejected')){markdown(body,v.message);chapter(body,v.readBack,opened,'rejected:'+index);}
    else if(event.kind==='human-approval'){markdown(body,`本次${v.decision.approved?'批准':'拒绝'}对应 ${v.action.approvalId}。`);chapter(body,v.readBackBeforeExecution,opened,'before:'+index);}
    else if(event.kind==='human-replacement')markdown(body,'人的修改只形成新的提议；原来的批准没有转移到新参数。');
    else if(event.kind==='approval-request')markdown(body,`**${v.input.title}**\n\n${v.input.body}\n\n请求标识：${v.approvalId}`);
    else if(event.kind==='actual-save')chapter(body,v.saved,opened,'saved:'+index);
    const technical=detail(body,'参数与原始记录','event-raw:'+index,opened);raw(technical,'实际记录',event.value);
  });
}
function render() {
  const container=get('result'),opened=new Set([...container.querySelectorAll<HTMLDetailsElement>('details[open]')].map(item=>item.dataset.key!)); container.replaceChildren();
  if(run)task.value=run.task;
  task.disabled=busy||!!replay||!!run&&['awaiting-direction','awaiting-approval','decision-recorded'].includes(run.state);
  get('source').textContent=run?source:''; get('task-box').hidden=section!=='direction';start.textContent=section==='approval'?'提议保存':'运行任务';start.hidden=section==='adoption'||(!!run&&['awaiting-direction','awaiting-approval','decision-recorded'].includes(run.state));
  if(!run){if(section==='adoption')markdown(container,'先在“选择方向”中完成并保存一份草稿，再阅读、修改和采用。');return;}
  if(run.error)markdown(container,run.error).className='tools-error';
  if(section==='direction'&&run.question){const form=document.createElement('section');form.className='human-question';container.append(form);heading(form,'当前待答问题','h2');markdown(form,run.question.question);
    run.question.options.forEach(option=>{const label=document.createElement('label'),radio=document.createElement('input');radio.type='radio';radio.name='direction';radio.value=option.id;radio.disabled=busy||!!replay;label.append(radio,document.createTextNode(option.id+' · '+option.label));form.append(label);});
    button(form,'记录选择并继续',()=>{const checked=form.querySelector<HTMLInputElement>('input:checked');if(!checked){status('请选择一个叙事切入。');return;}void act('answer',{toolCallId:run!.question!.toolCallId,choice:checked.value});});
  }
  if(section==='adoption'&&run.readBack){const current=document.createElement('section');current.className='human-current';container.append(current);heading(current,'当前稿件','h2');chapter(current,run.readBack,opened,'current-body');
    if(run.readBack.status!=='adopted')button(current,'采用这份稿件',()=>void act('adopt',{chapterRevision:run!.readBack!.revision,note:'已阅读并采用这份具体稿件。'}));
    const editor=detail(current,'修改这份稿件','edit',opened);editor.className='human-editor';const title=input(editor,'标题',run.readBack.title),body=input(editor,'正文',run.readBack.body,true);
    button(editor,'保存修改',()=>void act('edit',{chapterRevision:run!.readBack!.revision,title:title.value,body:body.value}),true);
    const previous=run.events.filter(item=>item.kind==='human-adopt').at(-1)?.value as {saved:{revision:number}}|undefined;
    if(previous&&previous.saved.revision!==run.readBack.revision){const test=detail(current,'检查旧版本的采用请求','old-adopt',opened);test.className='human-editor';markdown(test,`这份请求仍指向正文 r${previous.saved.revision}。内容已改变时，入口应拒绝旧版本。`);button(test,'提交这份采用请求',()=>void act('adopt',{chapterRevision:previous.saved.revision,note:'检查已保留的旧版本请求。'}),true);}
  }
  if(section==='approval'&&run.pending){const current=document.createElement('section');current.className='human-pending';container.append(current);heading(current,'当前保存请求','h2');markdown(current,`**${run.pending.input.title}**\n\n${run.pending.input.body}`);markdown(current,`作品：${run.pending.input.workId} · 第一章 · 要求 r${run.pending.input.expectedWorkRevision} · 正文依据 r${run.pending.input.expectedChapterRevision}`);
    const rawAction=detail(current,'调用标识与完整参数','pending-raw',opened);raw(rawAction,'实际请求',run.pending);
    markdown(current,run.state==='decision-recorded'?(run.decision?.approved?'批准已记录，保存函数尚未执行。':'拒绝已记录，尚未接续处理。'):'请核对这次操作的对象与完整内容。');
    const actions=document.createElement('div');actions.className='human-actions';current.append(actions);
    if(run.state==='awaiting-approval'){button(actions,'批准这次保存',()=>void act('decide',{approvalId:run!.pending!.approvalId,approved:true,reason:'已核对当前对象及完整参数，批准这次保存。'}));button(actions,'拒绝',()=>void act('decide',{approvalId:run!.pending!.approvalId,approved:false,reason:'不执行这次保存。'}),true);}
    if(run.state==='decision-recorded')button(actions,run.decision?.approved?'继续执行':'继续处理拒绝',()=>void act('resume',{approvalId:run!.pending!.approvalId}));
    const edit=detail(current,'修改这份提议','replace',opened);edit.className='human-editor';const title=input(edit,'标题',run.pending.input.title),body=input(edit,'正文',run.pending.input.body,true);
    button(edit,'加入相邻原文段落',()=>{title.value=materials.actions.D.title;body.value=materials.actions.D.body;},true);
    button(edit,'提交新参数，重新提议',()=>void act('replace',{approvalId:run!.pending!.approvalId,input:{...run!.pending!.input,title:title.value,body:body.value}}),true);
    const old=run.events.filter(item=>item.kind==='human-replacement').at(-1)?.value as {previous:{approvalId:string}}|undefined;
    if(old){const test=detail(current,'检查原批准的适用范围','old-approval',opened);markdown(test,`当前请求已变化。保留的原批准标识：${old.previous.approvalId}`);button(test,'用原批准请求继续',()=>void act('resume',{approvalId:old.previous.approvalId}),true);}
  }
  events(container,opened);
  heading(container,'程序独立读回','h2');chapter(container,run.readBack,opened,'readback');
  const process=detail(container,'模型请求与工具过程','process',opened);
  for(const call of run.calls){
    const node=detail(process,call.name+(call.state==='proposed'?' · 尚未执行':''),'call:'+call.id,opened),body=document.createElement('div');node.append(body);
    if(call.state==='completed'){
      heading(body,call.name==='ask_direction'?'人的回答：':'返回结果：','h4');
      if(call.name==='read_work')markdown(body,workText(call.output as HumanRun['work']));
      else if(call.name==='read_chapter')chapter(body,(call.output as {chapter:HumanRun['readBack']}).chapter,opened,'tool-body:'+call.id);
      else if(call.name==='save_draft'){const receipt=call.output as {chapterNumber:number;revision:number};markdown(body,`第 ${receipt.chapterNumber} 章已保存为草稿 · 正文 r${receipt.revision}`);}
      else{const choice=call.output as {id:string;text:string};markdown(body,`${choice.id} · ${choice.text}`);}
    }else if(call.error)markdown(body,call.error);
    else markdown(body,'这份调用尚未取得实际执行结果。');
    const technical=detail(body,'参数与原始返回','call-raw:'+call.id,opened);raw(technical,'调用参数',call.input);if(call.output!==undefined)raw(technical,'实际返回',call.output);
  }
  const requests=detail(process,'完整模型请求与原始返回','requests',opened);
  run.requests.forEach((request,index)=>{const round=detail(requests,`第 ${index+1} 次模型请求`,'request:'+index,opened);const payload=JSON.parse(request.body);raw(round,'实际请求',payload);if(request.response)raw(round,'原始返回',request.response);if(request.error)markdown(round,request.error);});
  const reports=detail(container,'模型汇报','report',opened);markdown(reports,run.report||'本次模型没有文字汇报。');
}
async function select(key:keyof typeof SECTIONS){section=key;document.querySelectorAll<HTMLButtonElement>('[data-section]').forEach(node=>node.setAttribute('aria-selected',String(node.dataset.section===section)));status('');run=replay?replay[phase()]:await json<HumanRun|null>('current?phase='+phase());render();}
document.querySelectorAll<HTMLButtonElement>('[data-section]').forEach(node=>node.onclick=()=>void select(node.dataset.section as keyof typeof SECTIONS));
start.onclick=async()=>{replay=null;source='本机运行';setBusy(true);status('正在准备任务…');try{await follow(await post<HumanRun>('run',{phase:phase(),...(phase()==='direction'?{task:task.value}:{input:materials.actions.C})}));}catch(error){status((error as Error).message);setBusy(false);}};
classroom.onclick=async()=>{setBusy(true);status('正在加载课堂实录…');try{replay=await json<Classroom>('classroom');source='课堂实录';run=replay[phase()];render();status('');}catch(error){status((error as Error).message);}finally{setBusy(false);render();}};
stop.onclick=async()=>{if(run)await post('runs/'+run.id+'/cancel',{}).catch(error=>status(error.message));};
void(async()=>{try{const loaded=await json<{materials:Materials;definitions:ToolDefinition[];defaultTask:string}>('materials');materials=loaded.materials;task.value=loaded.defaultTask;markdown(get('materials'),workText({...materials.work,revision:1}));for(const definition of loaded.definitions){const node=document.createElement('details'),summary=document.createElement('summary'),name=document.createElement('code'),description=document.createElement('span');name.textContent=definition.name;description.textContent=definition.description;summary.append(name,description);node.append(summary);raw(node,'完整工具定义',definition);get('definitions').append(node);}run=await json<HumanRun|null>('current?phase=direction');setBusy(false);if(run?.state==='running')await follow(run);else render();}catch(error){status((error as Error).message);}})();
