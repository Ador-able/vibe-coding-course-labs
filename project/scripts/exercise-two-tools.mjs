import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {Store} from '../dist/store.js';
import {workInput, draftInput} from '../dist/schemas.js';

const runId = randomUUID();
const runDir = resolve('runs', `mcp-two-${runId}`);
await mkdir(runDir, {recursive: true});
const dbPath = resolve(runDir, 'novel.sqlite');
const codeVersion = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
const write = (name, data) => writeFile(resolve(runDir, name), JSON.stringify(data, null, 2) + '\n', 'utf8');
const seed = workInput.parse({
  id: 'mcp-clocktower', title: '钟楼门前', purpose: '人工测试 MCP 读取、保存和修订反馈，不评判小说品质。',
  requirements: ['这是人工输入的实验文本，不能称为模型创作。', '保存为草稿，由人决定是否采用。'],
  facts: ['主角林澈来到钟楼门前；守塔人尚未开门。'],
  outline: [{number: 1, titleHint: '钟楼门前', goal: '取得进入钟楼的许可。'}, {number: 2, titleHint: '钟楼里面', goal: '观察钟楼内部。'}],
});
const initialDraft = draftInput.parse({
  workId: seed.id, chapterNumber: 1, expectedWorkRevision: 1, expectedChapterRevision: 0,
  expectedPreviousRevisions: [], title: '人工起点', body: '【人工业务实验】林澈站在钟楼门前。守塔人仍把钥匙握在手中。',
});
const manual = new Store(dbPath);
let initialChapter;
try {
  const work = manual.init(seed);
  const absent = manual.getChapter(seed.id, 2);
  initialChapter = manual.saveDraft(initialDraft, 'human');
  await write('业务独立起点.json', {work, secondChapter: absent, input: initialDraft, saved: initialChapter});
} finally {manual.close();}
const reopened = new Store(dbPath);
try {assert.deepEqual(reopened.getChapter(seed.id, 1), initialChapter);} finally {reopened.close();}

function snapshot() {
  const db = new DatabaseSync(dbPath, {readOnly: true});
  try {
    const tables = {};
    for (const table of ['works', 'work_versions', 'chapters', 'chapter_versions', 'tasks']) {
      tables[table] = db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => ({...row, content: JSON.parse(row.content)}));
    }
    return tables;
  } finally {db.close();}
}

function connectSession(label) {
  const events = [], calls = [];
  let stderr = '', closedResolve;
  const closed = new Promise(resolveClosed => {closedResolve = resolveClosed;});
  const transport = new StdioClientTransport({command: process.execPath, args: [resolve('dist/mcp-two-tools.js'), dbPath], stderr: 'pipe'});
  const client = new Client({name: 'novel-two-tools-experiment', version: '0.1.0'});
  transport.stderr?.on('data', bytes => {stderr += bytes.toString('utf8');});
  const record = (type, value) => events.push({time: new Date().toISOString(), type, ...value});
  const send = transport.send.bind(transport);
  transport.send = async (message, options) => {record('send', {message}); return send(message, options);};
  transport.onmessage = message => record('receive', {message});
  transport.onclose = () => {record('transport.closed', {pid: transport.pid}); closedResolve();};
  transport.onerror = error => record('transport.error', {message: error.message});
  return {
    client, transport, closed, record, calls,
    async open() {
      record('connect.start', {});
      await client.connect(transport);
      record('connect.end', {pid: transport.pid, version: client.getServerVersion(), capabilities: client.getServerCapabilities()});
    },
    async call(name, args) {
      try {
        const returned = await client.callTool({name, arguments: args});
        calls.push({name, arguments: args, returned});
        return returned;
      } catch (error) {
        calls.push({name, arguments: args, thrown: {name: error.name, message: error.message, code: error.code ?? null}});
        throw error;
      }
    },
    async close() {
      record('close.start', {pid: transport.pid});
      await client.close();
      record('close.end', {pid: transport.pid});
      await write(`${label}-协议.json`, events);
      await write(`${label}-调用.json`, calls);
      await writeFile(resolve(runDir, `${label}-stderr.txt`), stderr, 'utf8');
      assert.equal(transport.pid, null);
    },
  };
}

await write('运行输入.json', {runId, runDir, dbPath, codeVersion, seed, initialDraft, limits: '纯官方 Client 实验。文本由人准备，不调用模型，不改变全局宿主配置。'});
await write('MCP运行前业务.json', snapshot());
const normal = connectSession('正常连接');
let saved, humanEdited;
try {
  await normal.open();
  const tools = await normal.client.listTools();
  await write('工具发现.json', tools);
  assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ['read_work', 'save_draft']);
  const workResult = await normal.call('read_work', {workId: seed.id});
  assert.equal(workResult.structuredContent.result.revision, 1);
  const proposal = {...initialDraft, expectedChapterRevision: 1, title: '通过 MCP 保存', body: '【人工 MCP 实验】林澈说明来意，守塔人没有立即开门。'};
  saved = await normal.call('save_draft', proposal);
  assert.equal(saved.structuredContent.result.revision, 2);
  assert.equal(saved.structuredContent.result.status, 'draft');
  // 回读走人工 CLI，再核对完整正文，不能用保存请求充当保存证据。
  const readBack = JSON.parse(execFileSync(process.execPath, ['dist/cli.js', 'chapter', '1', '--db', dbPath, '--work', seed.id], {encoding: 'utf8'}));
  assert.equal(readBack.body, proposal.body);
  assert.deepEqual(readBack, saved.structuredContent.result);
  await write('CLI完整读回.json', readBack);
  const stale = await normal.call('save_draft', {...proposal, body: '【不应保存】旧提议。'});
  assert.equal(stale.isError, true);
  assert.equal(JSON.parse(stale.content[0].text).code, 'STALE_CHAPTER');
  const invalid = await normal.call('save_draft', {...proposal, chapterNumber: 0, expectedChapterRevision: 2});
  assert.equal(invalid.isError, true);
  const missing = await normal.call('read_work', {workId: 'missing-work'});
  assert.equal(missing.isError, true);
  assert.equal(JSON.parse(missing.content[0].text).code, 'WORK_NOT_FOUND');
  const human = new Store(dbPath);
  try {humanEdited = human.saveDraft({...proposal, expectedChapterRevision: 2, title: '人的改稿', body: '【人工修改】林澈退后一步，等守塔人说明条件。'}, 'human');}
  finally {human.close();}
  const outdated = await normal.call('save_draft', {...proposal, expectedChapterRevision: 2, body: '【不应保存】不能覆盖人的新稿。'});
  assert.equal(outdated.isError, true);
  assert.equal(JSON.parse(outdated.content[0].text).code, 'STALE_CHAPTER');
  await write('人工改稿.json', humanEdited);
} finally {await normal.close();}
await write('正常连接关闭后业务.json', snapshot());

// 在没有待执行写入时终止服务进程，观察丢失连接后的真实失败。
const disconnected = connectSession('断连');
let disconnectedError;
try {
  await disconnected.open();
  await disconnected.call('read_work', {workId: seed.id});
  const pid = disconnected.transport.pid;
  disconnected.record('process.kill', {pid, signal: 'SIGTERM', pendingWrite: false});
  process.kill(pid, 'SIGTERM');
  await disconnected.closed;
  try {await disconnected.call('read_work', {workId: seed.id});}
  catch (error) {disconnectedError = {name: error.name, message: error.message, code: error.code ?? null};}
  assert(disconnectedError, '断连后不应返回虚假的读取成功。');
} finally {await disconnected.close();}
await write('断连后业务.json', snapshot());

// 调用者本身抛出异常时，finally 同样结束官方 Client 的连接。
const exceptional = connectSession('调用者异常');
let callerError;
try {
  try {
    await exceptional.open();
    await exceptional.call('read_work', {workId: seed.id});
    throw new Error('【人工实验】读取后让调用者退出，检查 finally。');
  } finally {await exceptional.close();}
} catch (error) {callerError = error.message;}
assert.equal(callerError, '【人工实验】读取后让调用者退出，检查 finally。');

const finalSnapshot = snapshot();
assert.deepEqual(finalSnapshot, JSON.parse(await readFile(resolve(runDir, '正常连接关闭后业务.json'), 'utf8')));
await write('全部连接结束后业务.json', finalSnapshot);
const summary = {
  runId, runDir, dbPath, codeVersion, modelCalled: false, declaredTools: ['read_work', 'save_draft'],
  actualSavedRevision: saved.structuredContent.result.revision, humanFinalRevision: humanEdited.revision,
  humanFinalStatus: humanEdited.status, secondChapter: null, disconnectedError, callerError,
  limits: ['断连实验没有待执行写入，不证明中途断连可以撤销写入。', '本节两个工具的参数由人填写；真实模型调用另看已有四工具 Agent 的独立存档。', '没有实跑远程 HTTP、网络超时或 ChatCut。'],
};
await write('摘要.json', summary);
console.log(JSON.stringify(summary));
