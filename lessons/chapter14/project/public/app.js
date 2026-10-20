const lessons = [
  ['flow','先看反馈怎样流转','查看结果'],['authorization','核清账号和回调条件','查看材料'],['files','从章节文件取回完整文字','查看结果'],['ids','接好两张记录的 ID','查看结果'],['webhook','收到以后，任务完成了吗','查看结果'],['calendar','核对一次读稿讨论提案','查看提案'],['branch','保留本轮三条反馈','查看结果'],['acceptance','让接收者独立回查','查看验收卡'],
];
const page = document.body.dataset.page;
const lesson = lessons.find(l => l[0] === page);
const $ = selector => document.querySelector(selector);
const el = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
const load = async path => { const r = await fetch('/lessons/chapter14/' + path, { cache: 'no-store' }); if (!r.ok) throw new Error('这份课堂材料尚未保存。'); return path.endsWith('.txt') || path.endsWith('.md') ? r.text() : r.json(); };
const detail = (title, content) => { const n = el('details'); n.append(el('summary', title), content); return n; };
const raw = value => el('pre', typeof value === 'string' ? value : JSON.stringify(value, null, 2));
const prose = value => el('div', value, 'prose');
const table = rows => { const wrap = el('div', undefined, 'table-wrap'); const t = el('table'); for (const [a,b] of rows) { const tr = el('tr'); tr.append(el('th', a), el('td', b ?? '尚未保存')); t.append(tr); } wrap.append(t); return wrap; };
const options = (items, select) => { select.replaceChildren(); for (const [value,label] of items) { const o = el('option', label); o.value = value; select.append(o); } };
const empty = () => { $('#status').textContent = ''; $('#work').replaceChildren(el('p','这一步的课堂实录尚未保存。','empty')); $('#source').replaceChildren(); };
const chapterSource = async chapterNumber => {
  const [novel,outline,settings] = await Promise.all(['凡人原文片段与段落定位.json','凡人选拔与授课大纲.json','凡人选拔与授课设定.json'].map(name=>load('inputs/'+name)));
  const current=novel.fragments.find(fragment=>fragment.focusChapterNumber===chapterNumber), source=$('#source');
  source.replaceChildren(el('h2','原文与编纂依据'),el('p',current.title,'hint'),prose(current.body));
  source.append(detail('对应的大纲与设定 · 教师编纂',raw({outline:outline.events.find(row=>row.sourceSegmentId===current.id),settings:settings.facts.filter(row=>row.sourceSegmentId===current.id)})));
  for(const fragment of novel.fragments)if(fragment!==current)source.append(detail(fragment.title,prose(fragment.body)));
};
const origin = text => el('p',text,'hint');
function originalPage() {
  const source = $('#source'); source.replaceChildren(el('h2','原页回查'));
  const link = el('a','打开原 PDF'); link.href='/lessons/chapter14/files/fanren-C05.pdf'; link.target='_blank'; source.append(link);
  const select = el('select'); select.setAttribute('aria-label','原页'); options([['1','第1页'],['2','第2页'],['3','第3页']],select); source.append(el('br'),select);
  const img = el('img'); img.alt='完整C05原文片段页'; const change=()=>{img.src='/lessons/chapter14/files/pages/fanren-C05-'+select.value+'.png';}; select.addEventListener('change',change); change(); source.append(img);
}
function rowsOf(record) { return record?.data ?? record?.rows ?? []; }
function eventRow(record,eventId) { return rowsOf(record).find(r=>r.eventId===eventId); }
async function feedbackResult(manifest, key) {
  const entry=manifest.feedback.find(e=>e.key===key); if(!entry){empty();return;}
  const [input,call,tasks,feedbacks] = await Promise.all([entry.input,entry.response,entry.taskFinal,entry.feedbackFinal].map(load));
  const task=eventRow(tasks,input.eventId), feedback=eventRow(feedbacks,input.eventId);
  const work=$('#work'); work.replaceChildren(el('h2',entry.label), origin('本章隔离 n8n 表独立读回；查看不会再次提交。'));
  work.append(prose(input.feedback),table([['入口回答', 'HTTP '+call.status],['任务状态',task?.status],['通知',task?.notificationStatus],['任务行 ID',task?.id],['反馈行 ID',feedback?.id ?? '未写入成功反馈'],['反馈引用任务',feedback?.taskRowId ?? '无成功反馈引用'],...(page==='ids'?[['任务引用反馈',task?.feedbackRowId ?? '未写入反馈引用']]:[])]));
  if(page==='webhook'&&entry.taskReceived){const first=eventRow(await load(entry.taskReceived),input.eventId);work.append(table([['202 后首次实际读回',first?.status],['这次查询时间',entry.receivedReadAt]]));}
  if(page==='ids'){work.append(el('p','Task.id 交给 Feedback.taskRowId；Feedback.id 回写 Task.feedbackRowId。'));if(entry.incorrectLookup)work.append(detail('错用执行 ID 的实际查询',raw(await load(entry.incorrectLookup))));}
  const all=el('div');all.append(raw({input,http:call,task,feedback}),entry.execution?detail('原生节点实际执行',raw(await load(entry.execution))):el('p','执行详情尚未保存。'));work.append(detail('完整输入、回答与两表原件',all));
  await chapterSource(input.chapterNumber);
}
async function show() {
  $('#status').textContent=''; $('#button').disabled=true; $('#work').replaceChildren(); $('#source').replaceChildren();
  try {
    const value=$('#choice')?.value;
    if(['flow','ids','webhook'].includes(page)){await feedbackResult(await load('records/index.json'),value);}
    else if(page==='authorization'){
      const material=await load('inputs/授权案例完整材料.json'), example=material.cases.find(c=>c.id===value);
      $('#work').append(el('h2','案例 '+value),origin('教师构造材料 · 未执行外部授权'),prose(example.text),detail('本题完整任务与边界',prose(material.task)));
      $('#source').append(el('h2','已有业务证据的范围'),prose(material.localEvidence),origin(material.execution));
    }else if(page==='calendar'){
      const [proposal,calc,input]=await Promise.all([load('inputs/日历完整待执行提案.json'),load('materials/日历Node独立IANA计算.json'),load('inputs/日历完整教师请求.txt')]);
      $('#work').append(el('h2',proposal.topic),origin('教师提案 · 课堂设定日期2026年10月15日 · 尚未创建或邀请'),table([['作品编辑',proposal.contact.name+' · '+proposal.contact.email],['上海开始',calc.organizer.start],['上海结束',calc.organizer.end],['洛杉矶开始',calc.contact.start],['洛杉矶结束',calc.contact.end],['时长',calc.durationMinutes+'分钟'],['忙闲',proposal.busyCheck],['当前允许动作',proposal.allowedActionNow]]),detail('完整待执行提案',raw(proposal)),detail('真实本机 IANA 计算',raw(calc)));
      $('#source').append(el('h2','完整教师请求'),prose(input));
    }else if(page==='files'){
      const manifest=await load('records/index.json');if(!manifest.files){empty();return;}
      const response=await load(manifest.files.response);
      if(!Array.isArray(response.body?.documents)){
        $('#work').append(el('h2','本轮文字提取未完成'),table([['入口返回','HTTP '+response.status]]),detail('完整实际返回',raw(response)),detail('原生执行原件',raw(await load(manifest.files.execution))));
        if(value==='fanren-C05-pdf')originalPage();return;
      }
      const result=response.body.documents.find(d=>d.sourceId===value); if(!result)throw new Error('当前资料没有对应的实际返回。');
      $('#work').append(el('h2',result.fileName),origin('实际下载与原生提取结果 · 完整提示尚未发送模型'),table([['实际下载名',result.binaryMetadata?.fileName],['实际类型',result.actualMimeType],['提取状态',result.materialStatus==='text_available'?'已提取文字':'文字为空'],['实际 PDF 页数',result.pdfMetadata?.numpages ?? '不适用'],['提取形态',Array.isArray(result.rawParsedText)?result.rawParsedText.length+'页数组':typeof result.rawParsedText==='string'?'字符串':'未取得文字'],['文字长度',typeof result.preparedText==='string'?result.preparedText.length+'个UTF-16码元':'未取得文字']]),prose(result.preparedText||'本轮实际提取文字为空。'),detail('完整待发送提示',raw(result.preparedPrompt)),detail('身份、下载、解析原件',raw(result)));
      if(value==='fanren-C05-pdf')originalPage();else $('#source').append(el('h2','TXT 原件回查'),detail('完整 TXT 原文字节内容',prose(await load('files/fanren-C05.txt'))));
    }else if(page==='branch'){
      const manifest=await load('records/index.json');if(!manifest.branch){empty();return;}
      const [input,rows]=await Promise.all([load(manifest.branch.input),load(manifest.branch.rows)]); const item=input.tasks.find(t=>t.eventId===value), record=eventRow(rows,value);
      if(!record)throw new Error('当前反馈没有实际回执行。');
      $('#work').append(el('h2','本轮反馈 '+value.split('-').at(-1)),prose(item.feedback),table([['提交原值',JSON.stringify(item.failTask)],['原值类型',typeof item.failTask],['真实回执',record.routeStatus],['通知',record.notificationStatus],['文学采用','没有本轮采用操作']]),prose(record.reason),detail('完整回执与五项实际输入',raw(record)));
      await chapterSource(item.chapterNumber);
      const catalog=await load('inputs/完整教师反馈目录.json');$('#work').append(detail('完整教师目录与本轮范围',raw(catalog)));
    }else if(page==='acceptance'){
      const card=await load('inputs/接收者验收卡.json'); $('#work').append(el('h2',card.currentTask),origin('接收者卡 · 未执行'),prose(card.input.feedback));
      for(const step of card.steps){const s=el('div',undefined,'task-step');s.append(el('strong',step.id+' · '+step.state),el('p',step.task),origin('负责：'+step.responsible));$('#work').append(s);}
      $('#work').append(detail('开始前要填写的入口与对象',raw(card.prerequisites)),detail('通过、未通过、阻塞与未检查',raw(card.criteria)),detail('完整提交输入',raw(card.input)));
      await chapterSource(card.input.chapterNumber); $('#source').append(origin(card.recipientAction));
    }
  }catch(error){$('#work').replaceChildren(el('p',error.message,'empty'));}finally{$('#button').disabled=false;}
}
options(lessons.map(l=>[l[0]+'.html',l[1]]),$('#lesson'));$('#lesson').value=page+'.html';$('#lesson').addEventListener('change',()=>{location.href=$('#lesson').value;});
$('#title').textContent=lesson[1];$('#button').textContent=lesson[2];
const choices={flow:[['production-E01','正式 · 第五章 E01'],['duplicate-E01','串行重复 · 第五章 E01'],['production-E02','课堂失败 · 第六章 E02'],['test-E01','测试 · 第五章 E01']],ids:[['production-E01','正式 · 第五章 E01'],['production-E02','课堂失败 · 第六章 E02']],webhook:[['production-E01','正式 · 第五章 E01'],['duplicate-E01','串行重复 · 第五章 E01'],['production-E02','课堂失败 · 第六章 E02'],['test-E01','测试 · 第五章 E01']],authorization:[['A','案例A · 回调地址'],['B','案例B · 账号与范围'],['C','案例C · 外部推送']],files:[['fanren-C05-pdf','C05原文片段 · PDF'],['fanren-C05-txt','C05原文片段 · 完整TXT']],branch:[['fanren-batch-E02','第六章 · E02'],['fanren-batch-E01','第五章 · E01'],['fanren-batch-E03','第四章 · E03']]};
if(choices[page])options(choices[page],$('#choice'));else $('#choice-label').remove();
$('#button').addEventListener('click',show);$('#choice')?.addEventListener('change',()=>{$('#work').replaceChildren();$('#source').replaceChildren();$('#status').textContent='';});
