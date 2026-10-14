const $=id=>document.getElementById(id),prompts={A:'A-首章任务.txt',B:'B-条件检查任务.txt',H:'人的当前要求.json',C:'C-接续任务.txt',D:'交付记录.json'};
const element=(tag,text)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;return item;};
async function json(path){const response=await fetch(path);if(!response.ok)throw new Error('没有读到这份课堂记录。');return response.json();}
async function text(path){const response=await fetch(path);if(!response.ok)throw new Error('没有读到完整原件。');return response.text();}
function link(path,title){const a=element('a',title);a.href='/'+path;a.target='_blank';return a;}
function comparison(data){
  const wrapper=element('div'),table=element('table'),head=element('tr');wrapper.className='comparison';
  for(const title of data.columns)head.append(element('th',title));table.append(head);
  for(const row of data.rows){const tr=element('tr');for(const value of row)tr.append(element('td',value));table.append(tr);}
  wrapper.append(table);return wrapper;
}
function fullAnswer(path){
  const details=element('details');details.append(element('summary','完整原答'));let loaded=false,pending=false;
  details.addEventListener('toggle',async()=>{
    if(!details.open||loaded||pending)return;pending=true;
    details.querySelector('p')?.remove();
    try{details.append(element('pre',await text('/'+path)));loaded=true;}catch(error){details.append(element('p',error.message+' 重新展开可再试。'));}finally{pending=false;}
  });return details;
}
async function view(){
  const result=$('result');result.replaceChildren();
  // 一次查看对应一个任务，防止读到另一项的结果。
  $('view').disabled=true;$('lesson').disabled=true;
  try{
    const records=await json('/records/index.json'),selected=records.filter(record=>String(record.lesson)===$('lesson').value);
    if(!selected.length){result.append(element('p','这一步的课堂实录尚未保存。'));return;}
    for(const record of selected){
      result.append(element('h2',record.title),element('p',record.summary??''));
      if(record.comparison)result.append(comparison(record.comparison));
      if(record.finalResponse)result.append(fullAnswer(record.finalResponse));
      const details=element('details'),summary=element('summary','完整过程与来源');details.append(summary);
      const list=element('ul');for(const file of record.files??[]){const item=element('li');item.append(link(file.path,file.title??file.path));list.append(item);}details.append(list);result.append(details);
    }
  }catch(error){result.append(element('p',error.message+' 请重新查看。'));}finally{$('view').disabled=false;$('lesson').disabled=false;}
}
function inputs(){const panel=$('inputs');panel.replaceChildren(link('inputs/'+prompts[$('lesson').value],'当前完整任务'),link('inputs/完整初始作品.json','完整初始作品要求'));}
$('view').addEventListener('click',view);$('lesson').addEventListener('change',()=>{$('result').replaceChildren();inputs();});inputs();
