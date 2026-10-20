type Action = { id: string; label: string; runtime: 'local' | 'codex' | 'model'; steps: string[][]; records: string };
const action = (id: string, label: string, runtime: Action['runtime'], entry: string, args: string[] = [], records = 'runs'): Action => ({ id, label, runtime, steps: [[entry, ...args]], records });

// 页面只提供课程中已有的实验入口，不接收自由命令。
export const lessonActions: Record<string, Action[]> = {
  chapter03: [
    action('tiered', '按需读取', 'codex', '运行三种读法.mjs', ['--condition', 'tiered'], '运行记录'),
    action('full', '提供全文', 'codex', '运行三种读法.mjs', ['--condition', 'full'], '运行记录'),
    action('summary', '只提供本次摘要', 'codex', '运行三种读法.mjs', ['--condition', 'summary'], '运行记录'),
  ],
  chapter04: ['none', 'conflict', 'consistent'].map((id, n) => action(id, ['不提供样例', '提供冲突样例', '提供相容样例'][n], 'codex', '运行实验.mjs', ['--condition', id], '运行记录')),
  chapter05: ['serial', 'agent'].map((id, n) => action(id, ['应用安排读取', 'Agent 安排读取'][n], 'codex', 'dist/control.js', ['--case', 'existing', '--mode', id, '--cancel-after-ms', '180000'], 'runs/control')),
  chapter07: [
    action('objects', '比较两个数据库里的同一作品', 'local', 'scripts/observe-objects.mjs'),
    action('connection', '连接并读取 MCP 工具', 'local', 'scripts/observe-connection.mjs'),
    action('entries', '读取工具、资源与提示模板', 'local', 'scripts/observe-entries.mjs'),
    action('tools', '通过工具保存并读回', 'local', 'scripts/exercise-two-tools.mjs'),
  ],
  chapter08: [action('reminder', '检查提醒规则', 'local', 'scripts/observe-reminder.mjs')],
  chapter09: ['A', 'B'].map(id => action(id, `会话 ${id}`, 'codex', 'scripts/observe.mjs', ['--condition', id])),
  chapter10: [{ id: 'import', label: '导入第一段原文并读回', runtime: 'codex', records: 'runs', steps: [['scripts/prepare-fanren.mjs'], ['scripts/prepare-host.mjs'], ['scripts/run-task.mjs', '--prompt', 'inputs/158-凡人原文导入.txt', '--chapter', '1']] }],
  chapter12: [action('answers', '比较切块后的回答', 'model', 'scripts/observe-answers.mjs', ['$run'])],
  chapter13: [
    action('long', '比较三种长文整理方法', 'model', 'scripts/observe-long.mjs', ['$run'], 'records/long-text'),
    action('labels-v1', '按第一版口径分类', 'model', 'scripts/observe-labels.mjs', ['v1', '$run'], 'records/classification-v1'),
    action('labels-v2', '按第二版口径分类', 'model', 'scripts/observe-labels.mjs', ['v2', '$run'], 'records/classification-v2'),
    action('extract', '抽取并核对人数', 'model', 'scripts/observe-extract.mjs', ['$run'], 'records/extraction'),
    action('templates', '比较模板修改前后的结果', 'model', 'scripts/observe-templates.mjs', ['$run'], 'records/templates'),
  ],
};
