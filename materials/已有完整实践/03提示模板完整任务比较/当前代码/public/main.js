const ui={status:document.querySelector('#status'),items:document.querySelector('#items'),title:document.querySelector('#selected-title'),
 itemStatus:document.querySelector('#item-status'),result:document.querySelector('#result'),check:document.querySelector('#check'),original:document.querySelector('#original'),
 history:document.querySelector('#history'),historyIssues:document.querySelector('#history-issues'),feedback:document.querySelector('#feedback'),attempts:document.querySelector('#attempts'),summary:document.querySelector('#summary'),all:document.querySelector('#all-state')};
let data,selectedId;
const pretty=value=>JSON.stringify(value,null,2);
const labels={returned:'已返回',running:'处理中',failed:'失败',passed:'检查通过',pending:'待检查',needs_human:'待人确认',rejected:'未采用'};
function savedFile(path){return data.files.find(file=>file.path===path)?.text;}
function select(id){
 const record=data.state.records.find(item=>item.sourceId===id);if(!record)return;
 selectedId=id;
 const current=record.attempts.find(attempt=>attempt.id===record.currentAttempt),old=record.attempts[0];
 ui.title.textContent=`${id} · ${record.check.result?.title??old.check.result?.title??'字段记录'}`;
 ui.itemStatus.textContent=`生成：${labels[record.generationState]??record.generationState}　检查：${labels[record.checkState]??record.checkState}　内容：${labels[record.contentDecision]??record.contentDecision}`;
 ui.result.textContent=current.resultPath?savedFile(current.resultPath)??'完整结果文件未取得。':pretty({generationState:current.generationState,error:current.error??null});
 ui.check.textContent=pretty({checkState:record.checkState,issues:record.check.issues,contextChecks:record.check.contextChecks??[],contentLimit:record.check.contentLimit??'未取得完整生成结果，不能采用。'});ui.original.textContent=record.input.record.text;
 ui.history.textContent=pretty({origin:old.origin,check:old.check,completeObject:old.check.result});
 ui.historyIssues.replaceChildren();
 for(const issue of old.check.issues){const line=document.createElement('li');line.textContent=`${issue.field??issue.kind}：${issue.message??pretty(issue)}`;ui.historyIssues.append(line);}
 if(!old.check.issues.length){const line=document.createElement('li');line.textContent='历史结构与引用检查通过，内容仍待人确认。';ui.historyIssues.append(line);}
 ui.feedback.textContent=data.feedback[id]??'本项保留187的原配方和原结果；本轮没有新请求。';
 ui.attempts.textContent=pretty({sourceId:id,input:record.input,attempts:record.attempts,
  attemptFiles:data.files.filter(file=>file.path.startsWith(`attempts/${id}/`)||file.path===old.resultPath)});
 for(const button of ui.items.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.sourceId===id));
}
for(const button of document.querySelectorAll('button[data-direction]'))button.addEventListener('click',()=>{
 document.body.dataset.direction=button.dataset.direction;
 for(const peer of document.querySelectorAll('button[data-direction]'))peer.setAttribute('aria-pressed',String(peer===button));
});
try{
 const response=await fetch('state.json',{cache:'no-store'});if(!response.ok)throw new Error(`HTTP ${response.status}`);
 data=await response.json();
 for(const id of data.sourceIds){const record=data.state.records.find(item=>item.sourceId===id),button=document.createElement('button');
  button.type='button';button.dataset.sourceId=id;button.textContent=`查看${id} · ${labels[record.checkState]??record.checkState}`;
  button.addEventListener('click',()=>select(id));ui.items.append(button);
 }
 ui.status.textContent='已读取八项保存记录；本次页面没有运行模型。';
 ui.summary.textContent=pretty(data.state.summary);ui.all.textContent=pretty(data);select('R06');
}catch(error){ui.status.textContent='保存记录未能载入，请检查静态数据后重新打开。';ui.check.textContent=`${error.name}: ${error.message}`;}
// 只读快照供外部核对三方向对应的同一完整数据，不改变状态。
window.itemObservation=()=>({sourceIds:data?.sourceIds,selectedId,direction:document.body.dataset.direction,record:data?.state.records.find(x=>x.sourceId===selectedId)});
