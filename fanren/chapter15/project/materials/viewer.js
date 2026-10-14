const $=id=>document.getElementById(id),prompts={162:'162-完整调查任务.txt',164:'164-完整规则调查任务.txt',165:'165-完整测试任务.txt',170:'170-完整原生评审任务.txt',177:'177-完整交付任务.txt'};
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
function inputs(){const panel=$('inputs');panel.replaceChildren(link('inputs/'+prompts[$('lesson').value],'当前完整任务'),link('inputs/完整教师初始化.json','完整作品与三章初始化'),link('inputs/青岚修仙录-三章原始课堂存档.md','原始三章课堂存档'),link('inputs/独立业务预期.json','完整保存输入与独立预期'));}
$('view').addEventListener('click',view);$('lesson').addEventListener('change',()=>{$('result').replaceChildren();inputs();});inputs();
