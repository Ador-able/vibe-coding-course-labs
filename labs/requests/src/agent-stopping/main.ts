import '../lab.css';
import '../../../../shared/markdown.css';
import '../tools/style.css';
import './style.css';
import { renderMarkdown } from '../../../../shared/markdown.ts';
import type { ToolDefinition } from '../tools/contract.ts';
import { SCENARIOS, type Classroom, type Limits, type Materials, type Run, type Scenario } from './contract.ts';

const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = `<header><h1>Agent 继续、求助或停下</h1><p>沿实际工具反馈，核对本轮进展、结束原因和继续所需的条件。</p></header>
  <label for="scenario">情境 <select id="scenario">${Object.entries(SCENARIOS).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label>
  <p id="condition"></p>
  <section class="tools-definitions"><h2>工具定义</h2><div id="definitions"></div></section>
  <label for="task">任务</label><textarea id="task" rows="4" maxlength="12000"></textarea>
  <details id="limits"><summary>运行边界</summary><div class="limits-body">
  <label for="max-steps">模型调用上限 <input id="max-steps" type="number" min="1" max="64" step="1"></label>
  <label for="max-seconds">整轮时限（秒） <input id="max-seconds" type="number" min="0" max="3600" step="1"></label>
  <p class="note">一次模型调用可能提出多项工具调用。时限为0时不设置时间限制；不限制输出 token 数。</p></div></details>
  <div class="tools-controls"><button id="start" disabled>运行任务</button><button id="cancel" class="secondary" hidden>取消本轮</button><button id="classroom" class="secondary" disabled>加载课堂实录</button></div>
  <p id="status" role="status" aria-live="polite"></p>
  <details id="basis"><summary>任务材料与初始稿来源</summary><div id="materials"></div></details>
  <p id="source"></p><section id="result"></section>`;
const get = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
const selection=get<HTMLSelectElement>('scenario'),task=get<HTMLTextAreaElement>('task'),start=get<HTMLButtonElement>('start'),cancel=get<HTMLButtonElement>('cancel'),classroom=get<HTMLButtonElement>('classroom');
const maxSteps=get<HTMLInputElement>('max-steps'),maxSeconds=get<HTMLInputElement>('max-seconds');
let materials:Materials,definitions:ToolDefinition[]=[],tasks:Record<Scenario,string>,defaults:Limits;
let scenario:Scenario='A',run:Run|null=null,replay:Classroom|null=null,busy=false;
const status=(text:string)=>{get('status').textContent=text;};
async function json<T>(path:string,init?:RequestInit):Promise<T>{const response=await fetch('/api/agent-stopping/'+path,init),value=await response.json();if(!response.ok)throw new Error(value.error||'本机请求未完成。');return value;}
const post=<T>(path:string,body:unknown)=>json<T>(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function markdown(parent:HTMLElement,text:string){const node=document.createElement('div');renderMarkdown(node,text);parent.append(node);return node;}
function heading(parent:HTMLElement,text:string,tag:'h2'|'h3'='h3'){const node=document.createElement(tag);node.textContent=text;parent.append(node);}
function detail(parent:HTMLElement,label:string,key:string,opened:Set<string>){const node=document.createElement('details'),summary=document.createElement('summary');node.dataset.key=key;node.open=opened.has(key);summary.textContent=label;node.append(summary);parent.append(node);return node;}
function raw(parent:HTMLElement,label:string,value:unknown){const p=document.createElement('p'),pre=document.createElement('pre');p.textContent=label;pre.textContent=typeof value==='string'?value:JSON.stringify(value,null,2);parent.append(p,pre);}
function workText(work:Run['work']){return `### ${work.title}\n\n${work.purpose}\n\n${work.requirements.map(item=>'- '+item).join('\n')}\n\n${work.facts.join('\n\n')}\n\n${work.outline.map(item=>`### 第${item.number}章 ${item.titleHint}\n\n${item.goal}`).join('\n\n')}`;}
function chapter(parent:HTMLElement,value:Run['readBack'],opened:Set<string>,key:string){
  if(value===undefined){markdown(parent,'尚未取得本轮结束后的程序独立读回。');return;}
  if(value===null){markdown(parent,'第一章尚未保存。');return;}
  markdown(parent,`**${value.title}** · 正文 r${value.revision} · ${value.status==='adopted'?'已采用':'草稿，待人判断'}`);
  const body=detail(parent,'完整正文',key,opened);markdown(body,value.body);
}
function controls(){
  selection.disabled=busy;start.disabled=busy;classroom.disabled=busy;task.disabled=busy||!replay&&run?.state==='waiting';maxSteps.disabled=busy;maxSeconds.disabled=busy;cancel.hidden=!!replay||run?.state!=='running';start.hidden=!replay&&run?.state==='waiting';
  get('result').querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLButtonElement>('.stopping-question input, .stopping-question textarea, .stopping-question button').forEach(node=>{node.disabled=busy||!!replay;});
}
function condition(){
  get('condition').textContent=scenario==='C'?'本情境在独立数据库设置持续写入故障，观察工具失败后怎样收尾。':scenario==='cancel'?'工作区先载入一份有来源的既有稿。运行后可取消，再对照实际保留的内容。':'';
}
function renderDefinitions(){
  get('definitions').replaceChildren();
  const actual=run?.requests.length?[...new Map(run.requests.flatMap(request=>(JSON.parse(request.body).tools??[]).map((item:{function:ToolDefinition})=>[item.function.name,item.function] as const))).values()]:undefined;
  const names=scenario==='B'?['read_work','read_chapter','ask_direction']:['read_work','read_chapter','save_draft'];
  for(const definition of (actual??definitions.filter(item=>names.includes(item.name))) as ToolDefinition[]){
    const node=document.createElement('details'),summary=document.createElement('summary'),name=document.createElement('code'),description=document.createElement('span');
    name.textContent=definition.name;description.textContent=definition.description;summary.append(name,description);node.append(summary);raw(node,'完整工具定义',definition);get('definitions').append(node);
  }
}
function render(){
  const container=get('result'),opened=new Set([...container.querySelectorAll<HTMLDetailsElement>('details[open]')].map(item=>item.dataset.key!));container.replaceChildren();
  condition();controls();renderDefinitions();get('source').textContent=run?(replay?'课堂实录':'本机运行'):'';
  if(!run)return;
  task.value=run.task;maxSteps.value=String(run.limits.maxSteps);maxSeconds.value=String(run.limits.maxSeconds);
  heading(container,'本轮进展','h2');markdown(container,run.stop?.detail||run.stage);
  if(run.error)markdown(container,run.error).className='tools-error';
  if(run.stop){heading(container,'继续所需条件');markdown(container,run.stop.remaining.map(item=>'- '+item).join('\n'));}
  if(run.question){
    const question=document.createElement('section');question.className='stopping-question';container.append(question);heading(question,'当前待答问题');markdown(question,run.question.question);
    for(const option of run.question.options){const label=document.createElement('label'),radio=document.createElement('input');radio.type='radio';radio.name='answer';radio.value=option.id;radio.disabled=!!replay||busy;label.append(radio,document.createTextNode(option.id+' · '+option.label));question.append(label);}
    if(!replay){
      const label=document.createElement('label'),answer=document.createElement('textarea');label.textContent='也可以填写你的开场方向';answer.rows=2;answer.maxLength=4000;answer.disabled=busy;label.append(answer);question.append(label);
      const proceed=document.createElement('button');proceed.textContent='回答并继续';proceed.disabled=busy;question.append(proceed);
      proceed.onclick=async()=>{const chosen=question.querySelector<HTMLInputElement>('input:checked');if(!answer.value.trim()&&!chosen){status('请选择一个方案或填写你的方向。');return;}busy=true;proceed.disabled=true;controls();try{await follow(await post<Run>(`runs/${run!.id}/answer`,{toolCallId:run!.question!.toolCallId,...(answer.value.trim()?{answer:answer.value.trim()}:{choice:chosen!.value})}));}catch(error){busy=false;status((error as Error).message);proceed.disabled=false;controls();}};
    }
  }
  heading(container,'程序独立读回','h2');
  if(run.initialChapter){
    markdown(container,run.readBack&&run.readBack.revision>run.initialChapter.revision?'数据库含本轮新增保存；取消不会撤回已提交的修改。':'以下保留的是运行前已有稿，目前没有确认本轮新增保存。');
    const initial=detail(container,'运行前已有稿与来源','initial',opened);chapter(initial,run.initialChapter,opened,'initial-body');const source=detail(initial,'原始稿件来源','initial-source',opened);raw(source,'原始稿件来源',run.initialChapterSource);
  }
  chapter(container,run.readBack,opened,'readback');
  heading(container,'实际工具过程','h2');
  for(const call of run.calls){
    const waiting=call.name==='ask_direction'&&call.state==='running',node=detail(container,call.name+(waiting?' · 等待回答':call.state==='failed'?' · 执行失败':''),'call:'+call.id,opened),body=document.createElement('div');node.append(body);
    if(call.state==='completed'){
      heading(body,'返回结果：');
      if(call.name==='read_work')markdown(body,workText(call.output as Run['work']));
      else if(call.name==='read_chapter')chapter(body,(call.output as {chapter:Run['readBack']}).chapter,opened,'read:'+call.id);
      else if(call.name==='save_draft'){const receipt=call.output as {revision:number};markdown(body,`第一章草稿已保存 · 正文 r${receipt.revision}`);}
      else raw(body,'作者回答',call.output);
    }else if(call.error)markdown(body,call.error);else markdown(body,waiting?'问题与原任务已保留，尚待作者回答。':'尚未取得这项调用的结束记录。');
    const technical=detail(body,'参数与原始返回','call-raw:'+call.id,opened);raw(technical,'调用参数',call.input);if(call.output!==undefined)raw(technical,'实际返回',call.output);if(call.error)raw(technical,'实际错误',call.error);
  }
  const report=detail(container,'模型汇报','report',opened);markdown(report,run.report||'本轮没有最终文字汇报。');
  const records=detail(container,'完整请求与运行记录','records',opened);
  for(const [index,request] of run.requests.entries()){const item=detail(records,`第${index+1}次模型调用`,'request:'+index,opened);raw(item,'实际请求',JSON.parse(request.body));if(request.response!==undefined)raw(item,'原始返回',request.response);if(request.error)markdown(item,request.error);}
  const events=detail(records,'工具事件与停止记录','events',opened);raw(events,'实际记录',run.events);raw(events,'保留的任务消息',run.messages);
}
async function follow(value:Run){busy=true;run=value;try{while(true){render();if(run.state!=='running')break;status(run.stage+'…');await new Promise(resolve=>setTimeout(resolve,800));run=await json<Run>('runs/'+run.id);}status('');}finally{busy=false;render();}}
async function select(){scenario=selection.value as Scenario;busy=true;controls();status('');try{run=replay?replay.runs[scenario]??null:await json<Run|null>('current?scenario='+scenario);task.value=run?.task??tasks[scenario];maxSteps.value=String(run?.limits.maxSteps??defaults.maxSteps);maxSeconds.value=String(run?.limits.maxSeconds??defaults.maxSeconds);if(run?.state==='running')await follow(run);else render();}catch(error){status((error as Error).message);}finally{busy=false;controls();}}
selection.onchange=()=>void select();
start.onclick=async()=>{const input={scenario,task:task.value,limits:{maxSteps:Number(maxSteps.value),maxSeconds:Number(maxSeconds.value)}};busy=true;replay=null;run=null;controls();status('正在准备任务…');try{await follow(await post<Run>('run',input));}catch(error){busy=false;status((error as Error).message);controls();}};
cancel.onclick=async()=>{if(!run)return;cancel.disabled=true;try{await post(`runs/${run.id}/cancel`,{});status('已请求取消，正在核对本轮实际状态…');}catch(error){status((error as Error).message);}finally{cancel.disabled=false;}};
classroom.onclick=async()=>{busy=true;controls();try{const loaded=await json<Classroom>('classroom');if(!Object.keys(loaded.runs).length)throw new Error('本节课堂实录尚未备妥，可以先运行自己的任务。');replay=loaded;await select();}catch(error){status((error as Error).message);}finally{busy=false;controls();}};
void(async()=>{try{const data=await json<{materials:Materials;definitions:ToolDefinition[];tasks:Record<Scenario,string>;limits:Limits}>('materials');({materials,definitions,tasks,limits:defaults}=data);markdown(get('materials'),workText({...materials.work,revision:1}));raw(get('materials'),'取消情境初始稿来源',materials.initialChapterSource);await select();}catch(error){status((error as Error).message);}})();
