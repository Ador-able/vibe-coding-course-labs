import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    'receipt-table': { type: 'string' },
    'child-workflow': { type: 'string' },
    'child-output': { type: 'string' },
    'parent-output': { type: 'string' },
  },
});
const root = dirname(fileURLToPath(import.meta.url));

if (!values['child-output'] && !values['parent-output']) {
  throw new Error('请指定 child-output 或 parent-output。');
}
for (const [output, identity] of [['child-output', 'receipt-table'], ['parent-output', 'child-workflow']]) {
  if (!values[output]) continue;
  if (!values[identity]?.trim()) throw new Error(`指定 ${output} 时，请提供真实 ${identity}。`);
}

// 只把自己的实例身份绑定到本地模板，不创建表、工作流或发送请求。
if (values['child-output']) {
  const child = JSON.parse(await readFile(resolve(root, 'child.template.json'), 'utf8'));
  child.nodes.find(node => node.name === '保存本轮完整回执').parameters.dataTableId.value = values['receipt-table'];
  await save(values['child-output'], child);
}
if (values['parent-output']) {
  const parent = JSON.parse(await readFile(resolve(root, 'parent.template.json'), 'utf8'));
  parent.nodes.find(node => node.name === '同一次子执行传入全部任务').parameters.workflowId.value = values['child-workflow'];
  await save(values['parent-output'], parent);
}

async function save(output, value) {
  const path = resolve(output);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  process.stdout.write(`${path}\n`);
}
