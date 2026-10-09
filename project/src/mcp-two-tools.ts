import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import {Store} from './store.js';
import {workId, draftInput, workOutput, chapterOutput, LabError} from './schemas.js';

const dbPath = process.argv[2];
if (!dbPath) throw new Error('需要数据库路径。');
const store = new Store(dbPath);
const server = new McpServer({name: 'novel-two-tools', version: '0.1.0'}, {
  instructions: '先读取当前作品要求，按取得的修订和明确请求保存草稿；没有采用或发布能力。',
});

// MCP 只整理调用结果，资料读取和修订检查由已有业务函数完成。
function result(action: () => unknown): CallToolResult {
  try {
    const structuredContent = {result: action()};
    return {structuredContent, content: [{type: 'text', text: JSON.stringify(structuredContent)}]};
  } catch (error) {
    const failure = {
      code: error instanceof LabError ? error.code : 'STORE_ERROR',
      message: error instanceof Error ? error.message : String(error),
    };
    console.error(JSON.stringify({toolError: failure}));
    return {isError: true, content: [{type: 'text', text: JSON.stringify(failure)}]};
  }
}

server.registerTool('read_work', {
  title: '读取当前作品要求',
  description: '取得指定作品的用途、设定、要求、大纲和当前要求修订；保存前先读。',
  inputSchema: {workId},
  outputSchema: {result: workOutput},
  annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
}, ({workId}) => result(() => store.getWork(workId)));

server.registerTool('save_draft', {
  title: '保存章节草稿',
  description: '按当前要求与正文修订保存指定章的完整标题和正文。expectedPreviousRevisions 提供前面全部章节的修订，第一章为 []。初次正文修订为 0；旧基线被拒绝时重读并判断，不原样重试。状态始终 draft。',
  inputSchema: draftInput.shape,
  outputSchema: {result: chapterOutput},
  annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false},
}, input => result(() => store.saveDraft(input, 'agent')));

const transport = new StdioServerTransport();
transport.onclose = () => store.close();
await server.connect(transport);
// 关闭输入意味着客户端结束本地连接，服务释放自己的资料库。
process.stdin.once('end', () => server.close());
