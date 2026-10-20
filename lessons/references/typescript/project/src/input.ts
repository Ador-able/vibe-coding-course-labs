import { resolve } from 'node:path';
import { readDraft } from './draft.ts';
import type { Draft } from './draft.ts';

function describe(draft: Draft): string {
  return `${draft.chapter} / ${draft.title} / ${draft.notes?.length ?? 0}条说明`;
}

try {
  const input = process.argv[2] ? resolve(process.argv[2]) : new URL('../inputs/有效草稿.json', import.meta.url);
  const draft = await readDraft(input);
  console.log(JSON.stringify({ status: 'parsed', description: describe(draft), draft }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
