const ui=Object.fromEntries(['status','items','selected-title','item-status','result','check','original','export-status','summary','downloads','csv-result','whole','report'].map(id=>[id,document.getElementById(id)]));
let data,version='V1',selected='R06';
const pretty=x=>JSON.stringify(x,null,2);
function show(){
 const current=data.versions[version],input=data.input.find(x=>x.id===selected),row=Array.isArray(current.candidate?.records)?current.candidate.records.find(x=>x?.sourceId===selected):null;
 ui['selected-title'].textContent=`${version} · ${selected} · ${row?.title??'未取得字段记录'}`;
 ui['item-status'].textContent=`整批机械检查：${current.inspection.mechanicalState==='passed'?'通过':'未通过'}；证据含义与采用仍需人工决定。`;
 ui.result.textContent=row?pretty(row):current.raw??pretty(current.report.error);
 ui.original.textContent=input.text;
 ui.check.textContent=pretty({parseError:current.inspection.parseError,formatIssues:current.inspection.formatIssues,coverageIssues:current.inspection.coverageIssues,valueIssues:current.inspection.valueIssues.filter(x=>x.sourceId===selected),evidenceSubstringIssues:current.inspection.evidenceSubstringIssues.filter(x=>x.sourceId===selected),titleDecision:current.inspection.titleDecisions.find(x=>x.sourceId===selected),semanticDecision:current.inspection.semanticDecision});
 ui.summary.textContent=pretty({actualSummary:current.candidate?.summary??null,summaryIssues:current.inspection.summaryIssues,wholeTaskAdopted:false});
 ui['export-status'].textContent=`实际候选 CSV：${current.csvExport.state==='exported'?'已生成':'未生成'}；新进程读回：${current.csvReadback.state==='passed'?'逐行相同':'未通过'}。这不证明原抽取内容正确。`;
 ui['csv-result'].textContent=pretty({export:current.csvExport,readback:current.csvReadback});
 ui.downloads.replaceChildren();
 for(const [file,label] of [...(current.raw!==null?[[version+'-output.txt','完整原始输出']]:[]),[version+'-report.json','请求与返回记录'],...(current.csvExport.state==='exported'?[[version+'-candidate.csv','实际候选 CSV']]:[])]){const a=document.createElement('a');a.href=file;a.download=file;a.textContent=label;ui.downloads.append(a);}
 ui.whole.textContent=current.raw??'没有取得完整原答。';ui.report.textContent=pretty(current.report);
 for(const b of ui.items.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.sourceId===selected));
 for(const b of document.querySelectorAll('button[data-version]'))b.setAttribute('aria-pressed',String(b.dataset.version===version));
}
for(const b of document.querySelectorAll('button[data-version]'))b.addEventListener('click',()=>{version=b.dataset.version;show();});
for(const b of document.querySelectorAll('button[data-direction]'))b.addEventListener('click',()=>{document.body.dataset.direction=b.dataset.direction;for(const peer of document.querySelectorAll('button[data-direction]'))peer.setAttribute('aria-pressed',String(peer===b));});
(async()=>{try{const r=await fetch('comparison-state.json',{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);data=await r.json();for(const item of data.input){const b=document.createElement('button');b.type='button';b.dataset.sourceId=item.id;b.textContent='查看'+item.id;b.addEventListener('click',()=>{selected=item.id;show();});ui.items.append(b);}ui.status.textContent='已读取两版完整保存结果；本次页面没有模型请求。';show();}catch(error){ui.status.textContent='保存记录未能载入：'+error.message;}})();
