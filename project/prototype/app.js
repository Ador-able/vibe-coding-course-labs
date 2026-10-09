const $=id=>document.getElementById(id);
const parameters=new URLSearchParams(location.search);
let workId=parameters.get('work'),snapshot=null,selected=Number(parameters.get('chapter')??1),busy=false,uncertain=false;
const edits=new Map();
let pendingRemote=null;
function message(text,kind='normal',read=false){$('message').textContent=text;$('message').dataset.kind=kind;$('read-current').hidden=!read;}
async function request(path,options){let response;try{response=await fetch(path,options);}catch{const error=new Error('无法连接服务，本次请求结果未确认。');error.code='NETWORK_UNCONFIRMED';throw error;}const value=await response.json();if(!response.ok){const error=new Error(value.error.message);error.code=value.error.code;throw error;}return value;}
function edit(){return edits.get(selected);}
function isDirty(value=edit()){return !!value&&(value.title!==value.base.title||value.body!==value.base.body);}
function sync(){const current=edit();if(!current)return;current.title=$('draft-title').value;current.body=$('draft-body').value;$('edit-state').textContent=isDirty()?'有未保存修改':'与已读取稿一致';$('save').disabled=busy||uncertain||!isDirty();}
function setBusy(value){busy=value;const hasChapter=!!snapshot?.chapters.some(c=>c.number===selected);$('draft-title').disabled=value||!hasChapter;$('draft-body').disabled=value||!hasChapter;$('use-current').disabled=value;$('reload').disabled=value;$('read-current').disabled=value;$('save').disabled=value||uncertain||!isDirty();for(const button of $('chapters').querySelectorAll('button'))button.disabled=value;}
function context(){const container=$('work-context');container.replaceChildren();for(const [title,items] of [['用途',[snapshot.work.purpose]],['要求',snapshot.work.requirements],['已确认设定',snapshot.work.facts],['大纲',snapshot.work.outline.map(o=>'第 '+o.number+' 章 '+o.titleHint+'：'+o.goal)]]){const heading=document.createElement('h3');heading.textContent=title;const list=document.createElement('ul');for(const text of items){const item=document.createElement('li');item.textContent=text;list.append(item);}container.append(heading,list);}}
function navigation(){const nav=$('chapters');nav.replaceChildren();if(!snapshot.chapters.length){const empty=document.createElement('p');empty.textContent='尚无已保存章节';nav.append(empty);}for(const chapter of snapshot.chapters){const button=document.createElement('button');button.type='button';button.className='chapter';button.dataset.number=String(chapter.number);button.setAttribute('aria-current',chapter.number===selected?'page':'false');const number=document.createElement('span');number.className='chapter-number';number.textContent=String(chapter.number).padStart(2,'0');const text=document.createElement('span');const title=document.createElement('strong');title.textContent=chapter.title;const state=document.createElement('small');state.textContent='r'+chapter.revision+' · '+(chapter.status==='draft'?'草稿':'已采用')+(chapter.basisCurrent?'':' · 依据有变动');text.append(title,state);button.append(number,text);button.addEventListener('click',()=>{sync();selected=chapter.number;pendingRemote=null;$('comparison').hidden=true;render();message('已读取第 '+selected+' 章。');});nav.append(button);}}
function render(){
  if(!snapshot)return;
  $('work-title').textContent=snapshot.work.title;
  $('work-purpose').textContent=snapshot.work.purpose;
  navigation();context();
  const chapter=snapshot.chapters.find(c=>c.number===selected);
  if(!chapter){
    $('chapter-label').textContent='第 '+selected+' 章';
    $('chapter-heading').textContent='尚未保存';
    $('revision').textContent='作品 r'+snapshot.work.revision+' · 正文未保存';
    $('draft-title').value='';$('draft-body').value='';
    $('edit-state').textContent='等待首章草稿';
    setBusy(busy);message('第 '+selected+' 章尚未保存。');
    return;
  }
  if(!edits.has(selected))edits.set(selected,{base:structuredClone(chapter),workRevision:snapshot.work.revision,previous:snapshot.chapters.filter(c=>c.number<selected).map(c=>({number:c.number,revision:c.revision})),title:chapter.title,body:chapter.body});
  const current=edit();
  $('chapter-label').textContent='第 '+selected+' 章 · 当前草稿';
  $('chapter-heading').textContent=current.base.title;
  $('revision').textContent='读取 r'+current.base.revision+' · '+(current.base.status==='draft'?'草稿':'已采用')+' · '+(current.base.basisCurrent?'依据当前':'依据有变动');
  $('draft-title').disabled=busy;$('draft-body').disabled=busy;
  $('draft-title').value=current.title;$('draft-body').value=current.body;sync();
}
async function readCurrent(){setBusy(true);try{const incoming=await request('/api/work?work='+encodeURIComponent(workId));snapshot=incoming;const chapter=incoming.chapters.find(c=>c.number===selected);if(isDirty()){pendingRemote=chapter;$('remote-heading').textContent='当前已保存稿 · r'+chapter.revision;$('remote-body').value=chapter.body;$('comparison').hidden=false;message('当前已保存稿已读回。本地修改仍在上方，请先对照。','notice');}else{edits.delete(selected);$('comparison').hidden=true;message('已重新读取当前稿件。');}uncertain=false;render();}catch(error){message(error.message+'（'+error.code+'）','error',true);}finally{setBusy(false);}}
$('draft-title').addEventListener('input',sync);$('draft-body').addEventListener('input',sync);
$('draft-form').addEventListener('submit',async event=>{event.preventDefault();sync();if(!isDirty()||busy||uncertain)return;const current=edit();setBusy(true);message('正在保存草稿。');const input={workId,chapterNumber:selected,expectedWorkRevision:current.workRevision,expectedChapterRevision:current.base.revision,expectedPreviousRevisions:current.previous,title:current.title,body:current.body};try{const saved=await request('/api/draft',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});const incoming=await request('/api/work?work='+encodeURIComponent(workId));snapshot=incoming;edits.delete(selected);pendingRemote=null;$('comparison').hidden=true;render();message('已保存草稿 r'+saved.revision+'，并读回当前正文。');}catch(error){uncertain=error.code==='NETWORK_UNCONFIRMED'||error.code==='INTERNAL_ERROR';message(error.message+' 本地修改仍保留。'+(uncertain?'恢复连接后先读取当前稿。':error.code.startsWith('STALE_')?'请读取当前稿后对照。':'')+'（'+error.code+'）','error',true);}finally{setBusy(false);}});
$('reload').addEventListener('click',readCurrent);$('read-current').addEventListener('click',readCurrent);
$('use-current').addEventListener('click',()=>{if(!pendingRemote)return;edits.delete(selected);pendingRemote=null;$('comparison').hidden=true;uncertain=false;render();message('已用当前已保存稿开始编辑。');});
for(const button of document.querySelectorAll('[data-variant]')){if(button.tagName!=='BUTTON')continue;button.addEventListener('click',()=>{document.body.dataset.variant=button.dataset.variant;for(const b of document.querySelectorAll('.variant-switcher button'))b.setAttribute('aria-pressed',String(b===button));const url=new URL(location);url.searchParams.set('variant',button.dataset.variant);history.replaceState(null,'',url);});}
window.addEventListener('beforeunload',event=>{if([...edits.values()].some(isDirty)){event.preventDefault();event.returnValue='';}});
const initialVariant=['original','desk','notes'].includes(parameters.get('variant'))?parameters.get('variant'):'original';document.body.dataset.variant=initialVariant;for(const button of document.querySelectorAll('.variant-switcher button'))button.setAttribute('aria-pressed',String(button.dataset.variant===initialVariant));
setBusy(true);
try{if(!workId)workId=(await request('/api/config')).workId;snapshot=await request('/api/work?work='+encodeURIComponent(workId));render();if(snapshot.chapters.some(c=>c.number===selected))message('已读取当前草稿。');}catch(error){message(error.message+'（'+error.code+'）','error',true);}finally{setBusy(false);}
