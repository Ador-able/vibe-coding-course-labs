import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

export const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const configPath = process.env.N8N_LAB_CONFIG || path.join(os.homedir(), '.vibe-coding-labs/fanren-n8n-ch14.json');
export const sha = raw => createHash('sha256').update(raw).digest('hex');
export const load = async name => JSON.parse(await fs.readFile(path.join(root, name), 'utf8'));
export async function save(name, value) { const filename = path.join(root, name); await fs.mkdir(path.dirname(filename), { recursive: true }); await fs.writeFile(filename, JSON.stringify(value, null, 2) + '\n'); return filename; }
export async function configuration() {
  const value = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const url = new URL(value.baseUrl);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !value.apiKey) throw new Error('请提供本机隔离 n8n 的地址与 API key。');
  return value;
}
export async function exchange(baseUrl, route, method, bodyText, headers = {}) {
  const url = new URL(route, baseUrl).href;
  const startedAt = new Date().toISOString(), start = Date.now();
  const request = { method, url, bodyText: bodyText ?? null, bodyBytes: bodyText === undefined ? 0 : Buffer.byteLength(bodyText), bodySha256: bodyText === undefined ? null : sha(bodyText) };
  const name = '.local/raw-api/' + randomUUID() + '.json';
  try {
    const response = await fetch(url, { method, headers: { ...(bodyText === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: bodyText, signal: AbortSignal.timeout(60000) });
    const text = await response.text(); let body = null; try { body = JSON.parse(text); } catch {}
    const record = { request, startedAt, finishedAt: new Date().toISOString(), elapsedMs: Date.now()-start, status: response.status, responseHeaders: { contentType: response.headers.get('content-type') }, bodyText: text, body, bodyBytes: Buffer.byteLength(text), bodySha256: sha(text) };
    await save(name, record);
    return { record, privatePath: name, privateSha256: sha(JSON.stringify(record, null, 2)+'\n'), cookies: response.headers.getSetCookie() };
  } catch(error) {
    await save(name, { request, startedAt, finishedAt: new Date().toISOString(), elapsedMs: Date.now()-start, status: null, failure: { name: error.name, message: error.message }, body: null });
    throw new Error('本机请求未取得返回，原件留在 '+name+'；没有自动重试。');
  }
}
export async function publicApi(route, method = 'GET', body) {
  const config = await configuration();
  const result = await exchange(config.baseUrl, '/api/v1'+route, method, body===undefined?undefined:JSON.stringify(body), { 'X-N8N-API-KEY': config.apiKey });
  if(result.record.status>=400)throw new Error('n8n API HTTP '+result.record.status+'；私密原件留在 '+result.privatePath+'。');
  return result;
}
export function workflowProjection(value) {
  const fields = ['id','name','active','versionId','activeVersionId','nodes','connections','settings'];
  return Object.fromEntries(fields.filter(k=>k in value).map(k=>[k,value[k]]));
}
export function executionProjection(value) {
  const result=structuredClone(Object.fromEntries(['id','workflowId','workflowVersionId','mode','status','finished','startedAt','stoppedAt','waitTill','retryOf','retrySuccessId','data'].filter(k=>k in value).map(k=>[k,value[k]])));
  if(value.workflowData)result.workflowData=workflowProjection(value.workflowData);
  // 原生节点业务原文不改；请求认证头与存储中的二进制数据不公开。
  for(const [name,runs] of Object.entries(result.data?.resultData?.runData||{}))for(const run of runs)for(const output of Object.values(run.data||{}))for(const items of output||[])for(const item of items||[]){
    if(['接收完整反馈','接收两份目录','接收本轮完整批次'].includes(name)&&item.json)delete item.json.headers;
    for(const binary of Object.values(item.binary||{})){delete binary.data;delete binary.id;}
  }
  return result;
}
export async function publicRecord(name, result, project = value=>value) {
  const value = project(result.record.body);
  await save(name, value);
  await save(name+'.source.json', { kind: 'actual-n8n-field-projection', sourcePrivatePath: result.privatePath, sourcePrivateSha256: result.privateSha256, publicPath: name, publicSha256: sha(JSON.stringify(value,null,2)+'\n'), request: { method: result.record.request.method, url: result.record.request.url, bodySha256: result.record.request.bodySha256 }, startedAt: result.record.startedAt, finishedAt: result.record.finishedAt, status: result.record.status, excluded: ['认证请求头从未写入采集原件','账户/权限关系字段不进入 workflow/execution 投影','Webhook 节点 headers','二进制存储 data/id；公开原件与实际下载元信息另存'], completeBusinessTextPreserved: true });
}
