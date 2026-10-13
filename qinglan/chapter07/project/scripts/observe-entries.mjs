import {getCodeVersion} from '../dist/version.js';
import {localScenes,localWork} from './course-materials.mjs';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Store } from '../dist/store.js';

const runId = randomUUID();
const directory = resolve('runs/mcp-entries', runId);
mkdirSync(directory, { recursive: true });
const database = resolve(directory, 'teaching.sqlite');
const save = (name, value) => writeFileSync(resolve(directory, name), JSON.stringify(value, null, 2) + '\n', 'utf8');
let sequence = 0;
const record = (kind, data = {}) => appendFileSync(resolve(directory, 'protocol.jsonl'), JSON.stringify({ sequence: ++sequence, at: new Date().toISOString(), kind, ...data }) + '\n', 'utf8');
const work = localWork;
const firstChapter = {workId:work.id,chapterNumber:1,expectedWorkRevision:1,expectedChapterRevision:0,expectedPreviousRevisions:[],...localScenes.clientProbe};
// 人工准备和人工更新与两段只读观察分别留证。
const preparation = new Store(database);
try { preparation.init(work); preparation.saveDraft(firstChapter, 'human'); }
finally { preparation.close(); }

function snapshot() {
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    return Object.fromEntries([
      ['works', 'id'], ['work_versions', 'work_id,revision'], ['chapters', 'work_id,number'],
      ['chapter_versions', 'work_id,number,revision'], ['tasks', 'id'],
    ].map(([table, order]) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all().map(row => ({ ...row, content: JSON.parse(row.content) }))]));
  } finally { db.close(); }
}
const before = snapshot();
save('business-before.json', before);
const serverEntry = resolve('dist/mcp.js');
const mcpPackage = JSON.parse(readFileSync(resolve('node_modules/@modelcontextprotocol/sdk/package.json'), 'utf8'));
save('input.json', { runId, codeVersion: getCodeVersion(), node: process.version, mcpSdk: mcpPackage.version, serverEntry, serverEntrySha256: createHash('sha256').update(readFileSync(serverEntry)).digest('hex'), database, fixture: { origin: 'human', work, firstChapter }, modelCalls: 0, globalConfigurationChanges: 0 });

const client = new Client({ name: 'mcp-entry-observer', version: '1.0.0' });
const transport = new StdioClientTransport({ command: process.execPath, args: [serverEntry, database], cwd: process.cwd(), stderr: 'pipe' });
const send = transport.send.bind(transport);
transport.send = async message => { record('client-message', { message }); return send(message); };
transport.onmessage = message => record('server-message', { message });
transport.onerror = error => record('transport-error', { message: error.message });
transport.onclose = () => record('transport-closed');
transport.stderr.on('data', chunk => appendFileSync(resolve(directory, 'server-stderr.txt'), chunk));
const calls = [];
async function invoke(phase, method, params, action, expectedError = false) {
  try {
    const response = await action();
    if (expectedError) throw new Error(`预期错误没有发生：${method}`);
    calls.push({ phase, method, params, response });
    save('calls.json', calls);
    return response;
  } catch (error) {
    if (!expectedError || !(typeof error.code === 'number')) throw error;
    const failure = { name: error.name, code: error.code, message: error.message, data: error.data ?? null };
    calls.push({ phase, method, params, error: failure });
    save('calls.json', calls);
    return failure;
  }
}
const workUri = `novel://works/${work.id}/requirements`;
const chapterUri = `novel://works/${work.id}/chapters/1`;
const resourceObject = result => JSON.parse(result.contents[0].text);
const promptWork = prompt => JSON.parse(prompt.messages.find(message => message.content.type === 'resource' && message.content.resource.uri === workUri).content.resource.text);
let failure = null, verification = null, serverPid = null, objects = null;
try {
  await client.connect(transport);
  serverPid = transport.pid;
  record('connected', { pid: serverPid, capabilities: client.getServerCapabilities(), instructions: client.getInstructions() });
  const catalog = {
    tools: await invoke('发现', 'tools/list', {}, () => client.listTools()),
    resources: await invoke('发现', 'resources/list', {}, () => client.listResources()),
    templates: await invoke('发现', 'resources/templates/list', {}, () => client.listResourceTemplates()),
    prompts: await invoke('发现', 'prompts/list', {}, () => client.listPrompts()),
  };
  save('catalog.json', catalog);
  const resourceA = await invoke('观察A', 'resources/read', { uri: workUri }, () => client.readResource({ uri: workUri }));
  const toolA = await invoke('观察A', 'tools/call', { name: 'read_work', arguments: { workId: work.id } }, () => client.callTool({ name: 'read_work', arguments: { workId: work.id } }));
  const promptA = await invoke('观察A', 'prompts/get', { name: 'review_chapter', arguments: { workId: work.id, chapterNumber: '1' } }, () => client.getPrompt({ name: 'review_chapter', arguments: { workId: work.id, chapterNumber: '1' } }));
  const chapterResource = await invoke('观察A', 'resources/read', { uri: chapterUri }, () => client.readResource({ uri: chapterUri }));
  const chapterTool = await invoke('观察A', 'tools/call', { name: 'read_chapter', arguments: { workId: work.id, chapterNumber: 1 } }, () => client.callTool({ name: 'read_chapter', arguments: { workId: work.id, chapterNumber: 1 } }));
  const unsavedTool = await invoke('观察A', 'tools/call', { name: 'read_chapter', arguments: { workId: work.id, chapterNumber: 2 } }, () => client.callTool({ name: 'read_chapter', arguments: { workId: work.id, chapterNumber: 2 } }));
  const unsavedResource = await invoke('观察A', 'resources/read', { uri: `novel://works/${work.id}/chapters/2` }, () => client.readResource({ uri: `novel://works/${work.id}/chapters/2` }), true);
  const unsavedPrompt = await invoke('观察A', 'prompts/get', { name: 'review_chapter', arguments: { workId: work.id, chapterNumber: '2' } }, () => client.getPrompt({ name: 'review_chapter', arguments: { workId: work.id, chapterNumber: '2' } }), true);
  const missingArgument = await invoke('观察A', 'prompts/get', { name: 'review_chapter', arguments: { workId: work.id } }, () => client.getPrompt({ name: 'review_chapter', arguments: { workId: work.id } }), true);
  const afterA = snapshot();
  save('business-after-A.json', afterA);
  // 用独立只读连接核对全对象；目录数量和脚本自报不能代替正文。
  const businessWork = { ...before.works[0].content, revision: before.works[0].revision };
  assert.deepEqual(resourceObject(resourceA), businessWork);
  assert.deepEqual(toolA.structuredContent.result, businessWork);
  assert.deepEqual(promptWork(promptA), businessWork);
  assert.deepEqual(resourceObject(chapterResource), before.chapters[0].content);
  assert.deepEqual(chapterTool.structuredContent.result, before.chapters[0].content);
  assert.equal(promptA.messages.length, 3);
  const promptChapter = promptA.messages.find(message => message.content.type === 'resource' && message.content.resource.uri === chapterUri);
  assert.deepEqual(JSON.parse(promptChapter.content.resource.text), before.chapters[0].content);
  assert.equal(unsavedTool.structuredContent.result, null);
  assert.notEqual(unsavedTool.isError, true);
  assert.equal(unsavedResource.code, -32002);
  assert.equal(unsavedResource.data.code, 'CHAPTER_NOT_FOUND');
  assert.equal(unsavedPrompt.code, -32002);
  assert.equal(missingArgument.code, -32602);
  assert.deepEqual(afterA, before);

  const nextWork = { ...work, facts: [...work.facts, localScenes.clientAddedRequirement] };
  const human = new Store(database);
  let updated;
  try { updated = human.updateWork(nextWork, 1); }
  finally { human.close(); }
  save('human-update.json', { input: nextWork, expectedRevision: 1, result: updated });
  record('human-update-complete', { workId: work.id, revision: updated.revision });
  const beforeB = snapshot();
  save('business-before-B.json', beforeB);
  const resourceB = await invoke('观察B', 'resources/read', { uri: workUri }, () => client.readResource({ uri: workUri }));
  const promptB = await invoke('观察B', 'prompts/get', { name: 'review_chapter', arguments: { workId: work.id, chapterNumber: '1' } }, () => client.getPrompt({ name: 'review_chapter', arguments: { workId: work.id, chapterNumber: '1' } }));
  const afterB = snapshot();
  save('business-after-B.json', afterB);
  assert.deepEqual(resourceObject(resourceB), updated);
  assert.deepEqual(promptWork(promptB), updated);
  assert.equal(promptWork(promptA).revision, 1);
  assert.equal(promptWork(promptB).revision, 2);
  assert.deepEqual(afterB, beforeB);
  objects = { resourceA, toolA, promptA, chapterResource, chapterTool, unsavedTool, unsavedResource, unsavedPrompt, missingArgument, resourceB, promptB };
  save('complete-objects.json', objects);
  verification = { passed: true, sameWorkInThreeEntries: true, sameCompleteChapter: true, phaseAUnchanged: true, phaseBUnchanged: true, oldPromptRevision: 1, newResourceRevision: 2, newPromptRevision: 2, promptAMessages: 3, unsavedTool: 'result:null', unsavedResource: 'CHAPTER_NOT_FOUND', unsavedPrompt: '该章正文尚未保存', missingPromptArgument: 'Invalid params', humanUpdateBetweenPhases: true };
} catch (error) {
  failure = { name: error.name, message: error.message };
  verification = { passed: false, ...failure };
  record('observer-error', failure);
} finally {
  try { await client.close(); record('closed', { pid: transport.pid }); }
  catch (error) { failure ??= { name: error.name, message: error.message }; verification = { passed: false, ...failure }; }
}
const events = readFileSync(resolve(directory, 'protocol.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
const initialize = events.find(event => event.kind === 'server-message' && event.message.result?.protocolVersion);
const report = { runId, directory, database, serverPid, protocolVersion: initialize?.message.result.protocolVersion ?? null, publicCalls: calls.length, actualToolCalls: calls.filter(call => call.method === 'tools/call').length, modelCalls: 0, closePid: transport.pid, failure, verification, limits: '纯官方客户端取得完整返回；没有把提示交给模型，没有安装插件，没有验证资源订阅、自动上下文注入或Skill加载。人工更新发生在两段观察之间，只读阶段分别核对逻辑业务内容。' };
save('report.json', report);
console.log(JSON.stringify(report, null, 2));
if (!verification?.passed || transport.pid !== null) process.exitCode = 1;
