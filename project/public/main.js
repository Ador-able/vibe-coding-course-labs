const ui={form:document.querySelector('#locate-form'),method:document.querySelector('#method'),query:document.querySelector('#query'),
 locate:document.querySelector('#locate'),status:document.querySelector('#status'),heading:document.querySelector('#document-heading'),
 hits:document.querySelector('#hits'),context:document.querySelector('#context'),question:document.querySelector('#question'),
 answer:document.querySelector('#answer'),pageTitle:document.querySelector('#page-title'),source:document.querySelector('#source-page'),
 imageLink:document.querySelector('#image-link'),pageButtons:document.querySelector('#page-buttons'),
 fullBody:document.querySelector('#full-body'),allChunks:document.querySelector('#all-chunks'),
 selection:document.querySelector('#selection-record'),raw:document.querySelector('#raw-record'),file:document.querySelector('#file-download')};
let comparison,source,parentMapping,answers,answerError,selection;
function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function showPage(number){
 const page=source.pages.find(x=>x.physicalPage===number);if(!page)return;
 ui.pageTitle.textContent=`原始第${number}页`;
 const frame=element('div',undefined,'page-frame'),image=element('img');
 image.src=page.imagePath;image.alt=`${source.fileName}，文字版，原始第${number}页`;
 image.addEventListener('error',()=>{ui.source.replaceChildren(element('p','这一页的原图未能载入；返回材料保留，请检查对应原件。','gap'));});
 frame.append(image);ui.source.replaceChildren(frame);ui.imageLink.href=page.imagePath;ui.imageLink.hidden=false;
}
function display(chunk){
 const method=comparison.methods.find(x=>x.condition.id===ui.method.value),term=ui.query.value.trim();
 const parentData=method.condition.expandParent?parentMapping.parentPages:[];
 // 实际父页正文在固定结果里保存；同一页去重后按源文件顺序带回。
 const parents=parentData.filter((x,index,array)=>array.findIndex(y=>y.parentId===x.parentId)===index)
  .filter(x=>chunk?.parentIds.includes(x.parentId)).sort((a,b)=>a.physicalPage-b.physicalPage);
 const context=chunk?(method.condition.expandParent?parents.map(x=>x.body).join('\n\n'):chunk.text):'';
 selection={methodId:method.condition.id,term,selectedChunk:chunk??null,returnedParents:parents,context};
 ui.context.textContent=context||'本次没有返回材料。字面未命中不能证明原文没有相关含义。';
 ui.pageButtons.replaceChildren();
 for(const number of chunk?.sourcePages??[]){const button=element('button',`回查第${number}页`);button.type='button';button.addEventListener('click',()=>showPage(number));ui.pageButtons.append(button);}
 if(chunk?.sourcePages.length)showPage(chunk.sourcePages[0]);
 ui.selection.textContent=JSON.stringify(selection,null,2);
 const original=method.retrievals.find(x=>x.term===term);
 const record=answers?.records.find(x=>x.methodId===method.condition.id);
 const isRecordedFirst=term==='卡住'&&chunk?.chunkId===original?.selectedChunk?.chunkId;
 ui.question.textContent=isRecordedFirst&&record?record.question:'此处只对应实际记录中的“卡住”首个命中问答。';
 if(isRecordedFirst&&record){ui.answer.textContent=record.result?.text??`这次问答未取得完整结果：${record.error?.message??'请查看完整记录。'}`;}
 else if(answerError){ui.answer.textContent='问答记录未能载入；切分材料保留，请查看对应完整观察。';}
 else{ui.answer.textContent='这个查询或另一个命中块没有对应的模型问答，不能拿首个命中的回答代替。';}
 ui.raw.textContent=JSON.stringify({comparisonRunId:comparison.runId,sourceRunId:comparison.sourceRunId,
  selection,answerRecord:isRecordedFirst?record??null:null,answerError:answerError??null},null,2);
}
function search(){
 if(!comparison)return;const method=comparison.methods.find(x=>x.condition.id===ui.method.value),term=ui.query.value.trim();
 if(!term){ui.status.textContent='请输入需要回查的文字。';return;}
 const hits=method.chunks.filter(x=>x.text.includes(term));
 ui.heading.replaceChildren(element('h2',method.condition.label),element('p',`${source.fileName} · 文字版 · ${method.chunks.length}个小块`,'document-label'));
 ui.hits.replaceChildren();
 ui.allChunks.replaceChildren();
 for(const chunk of method.chunks){const item=element('section',undefined,'chunk-item');
  item.append(element('h3',`小块${chunk.index+1} · ${chunk.utf16Length}码元 · 第${chunk.sourcePages.join('、')}页`),
   element('div',chunk.text,'extracted-text'),element('p',`正文范围[${chunk.bodyRange.start}, ${chunk.bodyRange.end})`,'locator-caption'));
  ui.allChunks.append(item);
 }
 ui.status.textContent=hits.length?`字面命中${hits.length}个小块，默认取完整正文顺序中的第一个。`:'已读取文字中没有字面命中；输入和完整原文保留。';
 for(const chunk of hits){const button=element('button',`查看命中小块${chunk.index+1}`);button.type='button';button.addEventListener('click',()=>display(chunk));ui.hits.append(button);}
 display(hits[0]);
}
ui.form.addEventListener('submit',event=>{event.preventDefault();search();});
ui.method.addEventListener('change',search);
for(const button of document.querySelectorAll('[data-direction]')){
 if(button.tagName!=='BUTTON')continue;
 button.addEventListener('click',()=>{document.body.dataset.direction=button.dataset.direction;
  for(const peer of document.querySelectorAll('button[data-direction]'))peer.setAttribute('aria-pressed',String(peer===button));});
}
async function readJson(url){const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.json();}
try{
 [comparison,source,parentMapping]=await Promise.all([readJson('chunks.json'),readJson('source-document.json'),readJson('parent-pages.json')]);
 try{answers=await readJson('answers.json');}catch(error){answerError={name:error.name,message:error.message};}
 const body=await fetch('original-body.txt',{cache:'no-store'});if(!body.ok)throw new Error(`正文HTTP ${body.status}`);
 ui.fullBody.textContent=await body.text();ui.file.href=source.filePath;
 for(const method of comparison.methods){const option=element('option',method.condition.label);option.value=method.condition.id;ui.method.append(option);}
 ui.method.disabled=false;ui.locate.disabled=false;search();
}catch(error){ui.status.textContent='固定观察未能载入，请检查连接后重新打开。输入保留。';ui.raw.textContent=`${error.name}: ${error.message}`;}
// 只读观察入口供核对同对象的页面切换；它不驱动模型或保存业务状态。
window.chunkObservation=()=>({comparisonRunId:comparison?.runId,sourceRunId:comparison?.sourceRunId,selection,answerError});
