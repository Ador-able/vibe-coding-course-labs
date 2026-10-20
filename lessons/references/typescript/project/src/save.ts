import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readDraft } from './draft.ts';
import type { Draft } from './draft.ts';

type Saved = { status: 'saved'; file: string; draft: Draft; completeFile: string };

async function saveDraft(draft: Draft, file: string, record: (step: string) => void): Promise<Saved> {
  record('函数已经开始');
  const text = JSON.stringify(draft, null, 2) + '\n';
  await writeFile(file, text, 'utf8');
  record('写入已返回');
  const completeFile = await readFile(file, 'utf8');
  record('全文已读回');
  return { status: 'saved', file, draft, completeFile };
}

try {
  const output = fileURLToPath(new URL('../output/', import.meta.url));
  await mkdir(output, { recursive: true });
  const draft = await readDraft(new URL('../inputs/有效草稿.json', import.meta.url));
  const file = process.argv[2] ? resolve(process.argv[2]) : resolve(output, '草稿.json');
  const steps: string[] = [];
  const pending = saveDraft(draft, file, step => steps.push(step));
  // JS函数已经执行；Promise本身仍不是文件保存结果。
  console.log(JSON.stringify({ observation: '调用后立即观察', returnedPromise: pending instanceof Promise, steps: [...steps] }));
  const saved = await pending;
  console.log(JSON.stringify({ observation: '等待后观察', steps, saved }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
