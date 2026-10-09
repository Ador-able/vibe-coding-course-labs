import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const expectedGit = '31209d553e6b95af2f1ac1055fc6de5d08e22a36';
const chapterRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const labArgument = process.argv[2];
if (!labArgument) throw new Error('请提供已经检出固定版本、安装锁定依赖的实验项目目录。');
const labRoot = resolve(labArgument);
const gitRoot = execFileSync('git', ['-C', labRoot, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
if (relative(resolve(gitRoot), labRoot) !== '') throw new Error('提供的目录不是实验项目自身的 Git 根。');
const gitHead = execFileSync('git', ['-C', labRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (gitHead !== expectedGit) throw new Error('实验项目没有处在指定的固定版本。');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const requireFromLab = createRequire(resolve(labRoot, 'package.json'));
const aiPackagePath = requireFromLab.resolve('ai/package.json');
const aiPackage = JSON.parse(await readFile(aiPackagePath, 'utf8'));
if (aiPackage.version !== '7.0.122') throw new Error('本次回放使用锁定的 AI SDK 7.0.122。');
const aiEntry = requireFromLab.resolve('ai');
const { readUIMessageStream, simulateReadableStream } = await import(pathToFileURL(aiEntry).href);

const inputs = [
  { file: '01-历史完整结束.json', id: '1153e17e-e0b4-4870-978f-bf0eca94b0fb', sha256: 'ba1c2ad1f410c978b598eb8948d73240d1a46f6015a3f1c44b27ae6602c33638' },
  { file: '02-历史中途停止.json', id: 'f7f927eb-9faa-49d4-af68-fe3429ed2e67', sha256: '4f54884f3dddde0041ac586304ebc70342593fdd2bdd3f9b042166b0f816a17b' },
];
const replayId = randomUUID();
const outputDirectory = resolve(chapterRoot, '零模型记录', replayId);
await mkdir(outputDirectory, { recursive: true });
const report = {
  replayId, createdAt: new Date().toISOString(),
  scope: '把两份历史 UI 事件交给成熟 SDK 重新读取；不是新模型生成、HTTP 重连或业务保存。',
  historicalExecutionGit: 'd966a050551e0dab7bf7e21ba1924c32baeb5986',
  replayEnvironmentGit: gitHead, sdkVersion: aiPackage.version,
  recorderSha256: hash(await readFile(fileURLToPath(import.meta.url))),
  sdkEntrySha256: hash(await readFile(aiEntry)),
  newModelCalls: 0, newBusinessSaves: 0, cases: [],
};

for (const input of inputs) {
  const inputPath = resolve(chapterRoot, '拟用完整材料', input.file);
  const inputBytes = await readFile(inputPath);
  if (hash(inputBytes) !== input.sha256) throw new Error(`输入原字节不匹配：${input.file}`);
  const original = JSON.parse(inputBytes.toString('utf8'));
  if (original.id !== input.id) throw new Error(`输入会话标识不匹配：${input.file}`);
  const events = original.uiEvents.map(({ event }) => structuredClone(event));
  const result = {
    historicalRunId: original.id, historicalState: original.state,
    inputFile: input.file, inputBytes: inputBytes.length, inputSha256: input.sha256,
    originalRecord: original,
    eventsPassedToSdk: structuredClone(events),
    snapshots: [], sdkErrors: [], readerReturnedNormally: false, thrownError: null,
    finalSnapshot: null, comparisons: null,
  };
  try {
    // 回放按原顺序提交事件；没有补写终态，也不使用历史毫秒数模拟网络速度。
    const stream = simulateReadableStream({ chunks: events, initialDelayInMs: null, chunkDelayInMs: null });
    const messages = readUIMessageStream({
      stream, terminateOnError: false,
      onError: (error) => result.sdkErrors.push({ name: error?.name ?? typeof error, message: error?.message ?? String(error) }),
    });
    for await (const message of messages) {
      // SDK 返回完整消息快照；立即复制，避免后续就地更新改变已保存的观察。
      result.snapshots.push(structuredClone(message));
    }
    result.readerReturnedNormally = true;
  } catch (error) {
    result.thrownError = { name: error?.name ?? typeof error, message: error?.message ?? String(error) };
  }
  result.finalSnapshot = result.snapshots.at(-1) ?? null;
  const texts = result.finalSnapshot?.parts.filter((part) => part.type === 'text') ?? [];
  result.comparisons = {
    inputOriginalBytesUnchanged: hash(await readFile(inputPath)) === input.sha256,
    finalSnapshotExactlyMatchesHistoricalFinalMessage: isDeepStrictEqual(result.finalSnapshot, original.finalMessage),
    textPartsExactlyMatchHistoricalStageAnswers: isDeepStrictEqual(texts.map((part) => part.text), original.stages.map((stage) => stage.answer)),
    finalMessageId: result.finalSnapshot?.id ?? null,
    finalMetadata: result.finalSnapshot?.metadata ?? null,
    finalTextStates: texts.map((part) => part.state ?? null),
    progressParts: result.finalSnapshot?.parts.filter((part) => part.type === 'data-progress') ?? [],
  };
  await writeFile(resolve(outputDirectory, `${original.id}.json`), `${JSON.stringify(result, null, 2)}\n`);
  report.cases.push({ historicalRunId: original.id, snapshots: result.snapshots.length,
    readerReturnedNormally: result.readerReturnedNormally, sdkErrors: result.sdkErrors,
    thrownError: result.thrownError, comparisons: result.comparisons });
}
await writeFile(resolve(outputDirectory, '完整回放索引.json'), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
