export const groups = [
  { title: '02 理解模型怎样生成回答', items: [
    ['/mechanics/tokens/', '文本分词'], ['/mechanics/vectors/', '向量'],
    ['/mechanics/generation/', '逐步生成'], ['/mechanics/attention/', '注意力'], ['/mechanics/sampling/', '采样'],
  ] },
  { title: '03 让模型用好上下文与记忆', items: [
    ['/requests/context/', '上下文对照'], ['/requests/quality/', '材料对照'],
    ['/requests/latency/', '等待与用量'], ['/requests/memory/', '按需读取与记忆'],
    ['/requests/disclosure/', '渐进式信息披露'],
  ] },
  { title: '04 说清任务，并判断 AI 做得怎样', items: [
    ['/requests/task-goals/', '任务验收'], ['/requests/task-examples/', '样例对照'],
    ['/requests/task-feedback/', '局部反馈'], ['/requests/task-evaluation/', '评估样本'],
  ] },
  { title: '05 理解工具、工作流与 Agent', items: [
    ['/requests/tools/', '工具读写'],
    ['/requests/tool-results/', '工具反馈'],
    ['/lessons/chapter05/', '工具与人的决定'],
  ] },
  { title: '06 让人的判断进入 AI 的工作过程', items: [
    ['/requests/decisions/', '阅读方案'], ['/requests/collaboration/', '笔记共写'], ['/requests/feedback/', '人物指代'],
  ] },
  { title: '07 通过插件、MCP 和 Skills 扩展 AI', items: [
    ['/lessons/chapter07/', '插件与方法'],
  ] },
  { title: '08 组织跨会话的大任务', items: [
    ['/lessons/chapter08/', '原型与跨会话'],
  ] },
  { title: '09 委派子代理并汇总工作', items: [
    ['/lessons/chapter09/', '子代理'],
  ] },
  { title: '10 综合实践：基于成熟 Harness 完成一个 Agent', items: [
    ['/lessons/chapter10/', '连续 Agent'],
  ] },
  { title: '11 应用方向：把模型输出接入应用', items: [
    ['/requests/ask/', '独立提问'],
    ['/requests/structured/', '结构化输出'], ['/requests/streaming/', '流式消息'],
    ['/requests/message-history/', '消息记录'], ['/requests/requests/', '请求状态'],
  ] },
  { title: '12 应用方向：让 AI 依据自己的资料回答', items: [
    ['/lessons/chapter12/', '资料与检索'],
  ] },
  { title: '13 应用方向：长文与批量内容处理', items: [
    ['/lessons/chapter13/', '小说材料整理'],
  ] },
  { title: '14 应用方向：把 AI 接进业务流程', items: [
    ['/lessons/chapter14/', '业务流转'],
  ] },
  { title: '15 应用方向：与 AI 协作修改现有项目', items: [
    ['/lessons/chapter15/', '修改已有项目'],
  ] },
  { title: '16 验收自己的 Agent，迁移到新的任务', items: [
    ['/lessons/chapter16/', '迁移与验收'],
  ] },
  { title: '参考与排错', items: [
    ['/references/typescript/', 'TypeScript 与项目运行'],
    ['/references/recovery/', '代码、会话与数据恢复'],
  ] },
];
