import type { Message } from '../context/contract.ts';
import { parseMessage } from '../context/model.ts';
import { ModelError, type ModelConfig } from '../model.ts';
import { isObject, sendRecordedRequest } from '../recorded-model.ts';
import { QUESTION, type DisclosureRun } from './contract.ts';
import type { Materials } from './materials.ts';

const RULE = '你是小说写作助手。依据本次提供或读取的资料，按当前工作页的故事时间、人物认知与目标写正文，允许补写相容的动作、对白与心理。工作卡用于当前状态，详情与原文用于核对具体条件和旧事。区分已发生的事实、人物猜测与后续计划；不要用记忆中的后续情节代替当前依据。';
const READ_TOOL = [{ type: 'function', function: {
  name: 'read_material', description: '按入口或目录中给出的相对路径读取一份资料全文。',
  parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
} }];

export function initialMessages(entry: string, work: string): Message[] {
  return [
    { role: 'system', content: RULE },
    { role: 'user', content: `${QUESTION}\n\n全书入口（全书入口.md）：\n${entry}\n\n当前工作（当前工作.md）：\n${work}\n\n根据这次续写需要决定还要读取什么，路径从资料库根目录起算。` },
  ];
}

export async function runDisclosure(config: ModelConfig, materials: Materials, run: DisclosureRun, signal: AbortSignal) {
  async function call(messages: Message[], step: string, allowReading = false) {
    const record = { step, startedAt: new Date().toISOString(), requestBody: JSON.stringify({
      model: config.model, messages, max_tokens: 16384, temperature: 0, stream: false,
      // 不指定读取顺序或强制工具选择，由模型按当前信息决定下一步。
      ...(allowReading ? { tools: READ_TOOL, parallel_tool_calls: false } : {}),
    }) };
    run.requests.push(record);
    const message = parseMessage(await sendRecordedRequest(config, record, signal));
    const finish = run.requests.at(-1)!.finishReason;
    if (finish !== 'stop' && finish !== 'tool_calls') throw new ModelError('MODEL_RESPONSE_INCOMPLETE', '本步输出未完整结束，已保留实际输入和返回，请重试本条件。');
    if (!allowReading && message.tool_calls?.length) throw new ModelError('MODEL_RESPONSE_INVALID', '本条件没有提供读取能力，未执行模型返回的调用。');
    if (!message.tool_calls?.length && !message.content?.trim()) throw new ModelError('MODEL_RESPONSE_INVALID', '模型没有返回可用文字或读取请求。');
    return message;
  }

  if (run.condition === 'tiered') {
    const entry = await materials.read('全书入口.md'), work = await materials.read('当前工作.md');
    run.supplied.push(entry, work);
    const messages = initialMessages(entry.text, work.text);
    for (let step = 0; step < 24; step++) {
      const response = await call(messages, `逐层读取 · 第 ${step + 1} 次请求`, true);
      messages.push(response);
      if (!response.tool_calls?.length) { run.answer = response.content; return; }
      for (const tool of response.tool_calls) {
        if (tool.function.name !== 'read_material') throw new ModelError('MODEL_RESPONSE_INVALID', '模型请求了未提供的工具，未执行。');
        let args: unknown;
        try { args = JSON.parse(tool.function.arguments); } catch { throw new ModelError('MODEL_RESPONSE_INVALID', '读取参数不是有效 JSON，未继续读取。'); }
        if (!isObject(args) || Object.keys(args).length !== 1 || typeof args.path !== 'string') throw new ModelError('MODEL_RESPONSE_INVALID', '读取请求缺少资料路径，未继续读取。');
        const material = await materials.read(args.path);
        const content = JSON.stringify(material);
        run.reads.push({ ...material, request: run.requests.length, callId: tool.id });
        run.tools.push({ callId: tool.id, name: tool.function.name, arguments: tool.function.arguments, result: content });
        // 只把本次真实读取的全文加入消息，下一轮才拥有这些新依据。
        messages.push({ role: 'tool', tool_call_id: tool.id, content });
      }
    }
    throw new ModelError('MODEL_RESPONSE_INCOMPLETE', '已达到本次读取轮数上限，仍未结束。已有记录保留，不将它记为完成。');
  }

  // 摘要从小说原文生成，不混入为逐层读取整理的工作卡和设定档案。
  const paths = run.condition === 'summary' ? materials.paths.filter(path => path.startsWith('原文/')) : materials.paths;
  const supplied = await Promise.all(paths.map(path => materials.read(path)));
  run.supplied.push(...supplied);
  const text = supplied.map(item => `## ${item.path}\n${item.text}`).join('\n\n');
  if (run.condition === 'summary') {
    // 摘要是通用交接信息，不提前指定本轮续写目标；写作阶段不继承原始材料。
    const compressed = await call([{ role: 'system', content: '把以下小说原文整理成约300字的剧情摘要。只总结到第二十七章“配灵药”开头、韩立准备按稀有配方催药的时点，不纳入后续情节。保留此时有效的人物、关系、地点、物品使用条件、未完成事项与原文编号。只输出摘要。' }, { role: 'user', content: text }], '从原文生成摘要');
    run.summary = compressed.content!;
  }
  const material = run.summary === undefined ? text : `本次生成的摘要：\n${run.summary}`;
  run.answer = (await call([{ role: 'system', content: RULE }, { role: 'user', content: `${QUESTION}\n\n本轮可用资料：\n${material}` }], '根据本轮资料回答')).content;
}
