import fs from 'node:fs';
import path from 'node:path';
import { root, readJson, writeJson } from '../src/files.mjs';
import { teaching } from '../src/teaching.mjs';

const material = teaching(), file = path.join(root, 'records/index.json');
const index = fs.existsSync(file) ? readJson(file) : { groups: {} };
const view = { ready: true, material: { long: material.long, labels: material.labels, logs: material.logs, reference: material.reference,
  codebooks: { v1: material.files['分类-口径-v1.json'], v2: material.files['分类-口径-v2.json'] }, files: material.files }, runs: {}, batch: null };
for (const [group, reportPath] of Object.entries(index.groups)) {
  const report = readJson(path.join(root, reportPath)), directory = path.dirname(path.join(root, reportPath));
  // 只展示或核查当前冻结输入对应的实录，历史原件不改写。
  if (JSON.stringify(report.inputFiles) !== JSON.stringify(material.registry.files)) continue;
  if (group === 'batch') {
    const plan = readJson(path.join(directory, 'plan.json'));
    view.batch = { directory: path.relative(root, directory).replaceAll('\\', '/'), plan, items: plan.sourceIds.map(id => readJson(path.join(directory, 'items', `${id}.json`))), readback: fs.existsSync(path.join(directory, 'readback.json')) ? readJson(path.join(directory, 'readback.json')) : null };
    continue;
  }
  view.runs[group] = { ...report, calls: report.calls.map(call => {
    const at = path.join(directory, call.id), checkFile = path.join(at, 'inspection.json');
    const csvDir = path.join(at, 'csv');
    const csv = fs.existsSync(path.join(csvDir, 'csv-export.json')) ? { export: readJson(path.join(csvDir, 'csv-export.json')), readback: fs.existsSync(path.join(csvDir, 'csv-readback.json')) ? readJson(path.join(csvDir, 'csv-readback.json')) : null } : null;
    return { id: call.id, input: call.input, materialScope: call.materialScope, status: call.status, result: call.result, error: call.error, settings: call.settings,
      check: fs.existsSync(checkFile) ? readJson(checkFile) : null, csv, recordUrl: '/' + path.relative(root, path.join(at, 'record.json')).replaceAll('\\', '/') };
  }) };
}
writeJson(path.join(root, 'public/lab.json'), view);
console.log(JSON.stringify({ groups: Object.keys(view.runs), batch: Boolean(view.batch), newModelCalls: 0 }));
