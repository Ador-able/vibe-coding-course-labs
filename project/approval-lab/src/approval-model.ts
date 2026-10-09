import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { APICallError, generateText, isStepCount, tool, type ModelMessage, type ToolApprovalResponse, type ToolApprovalRequestOutput } from 'ai';
import { isDeepStrictEqual } from 'node:util';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { draftInput, LabError, type DraftInput } from './schemas.js';
import { Store } from './store.js';
import { ApprovalTasks, type PendingAction } from './approval-state.js';

export function actionMessage(input: DraftInput): ModelMessage {
  return {
    role: 'user',
    content: `请准确提议以下 save_draft 动作，全部参数如下。不得改写给定正文或省略修订依据；这是教学草稿的保存请求，必须等待针对具体动作的人工批准。\n${JSON.stringify(input, null, 2)}`,
  };
}

export function approvalMessage(approvalId: string, approved: boolean, reason: string): ModelMessage {
  const response: ToolApprovalResponse = { type: 'tool-approval-response', approvalId, approved, reason };
  return { role: 'tool', content: [response] };
}

export async function runSdk(
  store: Store,
  tasks: ApprovalTasks,
  taskId: string,
  messages: ModelMessage[],
  mode: 'propose' | 'close' | 'resume',
) {
  const missing = ['API_BASE_URL', 'MODEL', 'API_KEY'].filter(key => !process.env[key]?.trim());
  if (missing.length) throw new LabError('CONFIG_MISSING', '请先在请求观察室保存模型设置，再用 scripts/run-lab.mjs 启动本实验。');
  const baseUrl = process.env.API_BASE_URL!.trim().replace(/\/+$/, '');
  const url = new URL(baseUrl);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new LabError('CONFIG_INVALID', 'API_BASE_URL 需要正常的 HTTP 或 HTTPS Base URL。');
  }
  const model = process.env.MODEL!.trim();
  const apiKey = process.env.API_KEY!.trim();
  const callNumber = tasks.get(taskId).events.filter(event => event.kind === 'sdk-result').length + 1;
  const directory = resolve('runs', taskId, `${callNumber}-${mode}`);
  await mkdir(directory, { recursive: true });
  const writeRecord = (name: string, value: unknown) => writeFile(resolve(directory, name), JSON.stringify(value, null, 2) + '\n', 'utf8');
  let requestNumber = 0;
  const provider = createOpenAICompatible({
    name: 'compatible', baseURL: baseUrl, apiKey, includeUsage: true,
    fetch: async (request, init) => {
      requestNumber += 1;
      // 只记录教学请求正文和响应，不记录含凭据的请求头。
      await writeRecord(`request-${requestNumber}.json`, {
        url: String(request), body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
      });
      const response = await fetch(request, init);
      await writeRecord(`response-${requestNumber}.json`, { status: response.status, body: await response.clone().json() });
      return response;
    },
  });
  const tools = {
    save_draft: tool({
      description: '按当前作品、章稿与前文修订保存一份本地教学草稿。需要针对本次具体参数的人工批准，不采用或发布。',
      inputSchema: draftInput,
      execute: async (input, options) => {
        const task = tasks.get(taskId);
        const action = task.pending;
        const decision = task.activeDecision;
        if (task.state !== 'running' || !action || !decision?.approved || decision.approvalId !== action.approvalId
          || options.toolCallId !== action.toolCallId || !isDeepStrictEqual(input, action.input)) {
          throw new LabError('ACTION_NOT_APPROVED', '实际动作没有与当前参数对应的人工批准。');
        }
        const saved = store.saveDraft(input, 'agent');
        tasks.append(taskId, 'actual-execution', { approvalId: action.approvalId, toolCallId: options.toolCallId, input, saved });
        return saved;
      },
    }),
  };
  const providerRecord = { provider: 'bailian', baseUrl, model };
  await writeRecord('input.json', { provider: providerRecord, mode, messages });
  const result = await generateText({
    model: provider.chatModel(model), tools, messages,
    instructions: '这是人工动作审批教学实验。人拒绝或撤回保存时，不执行、不重试、不擅自提出替代保存；只如实说明当前状态。只有明确要求提议新动作时才提出新请求。不得采用、发送或发布。',
    toolApproval: { save_draft: { type: 'user-approval', reason: '保存这份具体教学正文前，由人核对实际参数。' } },
    activeTools: mode === 'propose' ? ['save_draft'] : [],
    toolChoice: mode === 'propose' ? { type: 'tool', toolName: 'save_draft' } : 'none',
    stopWhen: isStepCount(1), maxOutputTokens: 2048, maxRetries: 0, timeout: 60_000,
    providerOptions: { compatible: { stream: false, parallel_tool_calls: false } },
    onToolExecutionStart: event => { tasks.append(taskId, 'sdk-execution-start', { toolCall: event.toolCall }); },
    onToolExecutionEnd: event => { tasks.append(taskId, 'sdk-execution-end', { toolCall: event.toolCall, toolOutput: event.toolOutput }); },
  });
  const record = {
    provider: providerRecord, mode, content: result.content, responseMessages: result.responseMessages,
    text: result.text, finishReason: result.finishReason, rawFinishReason: result.rawFinishReason, usage: result.usage,
    steps: result.steps.map((step, index) => ({ step: index, content: step.content, toolCalls: step.toolCalls, toolResults: step.toolResults })),
  };
  await writeRecord('result.json', record);
  tasks.append(taskId, 'sdk-result', record);
  const requests = result.content.filter((part): part is ToolApprovalRequestOutput<typeof tools> => part.type === 'tool-approval-request' && !part.isAutomatic);
  let pending: PendingAction | null = null;
  if (mode === 'propose') {
    if (requests.length !== 1) throw new LabError('APPROVAL_REQUEST_MISSING', '模型没有形成一项完整的原生待审批请求，不能算作通过。');
    const request = requests[0];
    if (request.toolCall.toolName !== 'save_draft') throw new LabError('ACTION_MISMATCH', '待决工具与本次任务不一致。');
    const input = draftInput.parse(request.toolCall.input);
    if (!isDeepStrictEqual(input, tasks.get(taskId).intent)) throw new LabError('ACTION_MISMATCH', '实际提议参数与本次明确请求不同，请保留记录并重新判断。');
    pending = { approvalId: request.approvalId, toolCallId: request.toolCall.toolCallId, toolName: 'save_draft', input };
  } else if (requests.length) {
    throw new LabError('UNEXPECTED_NEW_ACTION', '处理决定时出现了另一个待审批动作，不能冒称本次动作已完成。');
  }
  return { pending, messages: [...messages, ...result.responseMessages], record };
}

export function publicFailure(error: unknown): { code: string; message: string; statusCode?: number } {
  if (error instanceof LabError) return { code: error.code, message: error.message };
  if (APICallError.isInstance(error)) return { code: 'MODEL_HTTP_ERROR', message: `模型请求未正常完成${error.statusCode ? `，HTTP ${error.statusCode}` : ''}。请查看本轮不含凭据的响应记录。`, statusCode: error.statusCode };
  return { code: 'SDK_ERROR', message: error instanceof Error ? error.message.replaceAll(process.env.API_KEY ?? '\u0000', '[凭据]') : 'SDK 没有正常完成本轮。' };
}
