// 独立教学构造：反馈后满 24 小时且未暂停，才提示人工处理；不属于小说页面功能。
const dueAfter=24*60*60*1000;
function reminder({feedbackAt,now,paused}){return !paused&&now-feedbackAt>=dueAfter;}
const feedbackAt=Date.parse('2026-10-01T09:00:00+08:00');
const inputs=[{name:'不足 24 小时',feedbackAt,now:feedbackAt+dueAfter-1,paused:false},{name:'恰满 24 小时',feedbackAt,now:feedbackAt+dueAfter,paused:false},{name:'满时但暂停',feedbackAt,now:feedbackAt+dueAfter,paused:true},{name:'过时且恢复',feedbackAt,now:feedbackAt+dueAfter+1,paused:false},{name:'新反馈重新计时',feedbackAt:feedbackAt+dueAfter,now:feedbackAt+dueAfter+1,paused:false}];
console.log(JSON.stringify({scope:'教师构造规则及确定时间输入；真实执行纯函数。没有实际发送提醒，也没有增加工作台计时功能。',rule:'收到反馈后满 24 小时，且未暂停时提示人工处理；新反馈从它的时间重新计时。',outputs:inputs.map(input=>({...input,shouldRemind:reminder(input)}))},null,2));
