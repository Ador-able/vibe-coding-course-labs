import { createRun, finishRun } from '../src/files.mjs';
import { teaching } from '../src/teaching.mjs';
import { modelRecorder } from '../src/model.mjs';

const stage = process.argv[2];
if (!['discovery', 'v1', 'v2'].includes(stage)) throw new Error('请选择 discovery、v1 或 v2。');
const material = teaching(), run = createRun(`classification-${stage}`, process.argv[3]), answer = modelRecorder(run, 2);
run.report.stage = stage; run.save();
let error;
try { for (const n of [0, 1]) await answer(`batch-${n + 1}`, material.labelInput(stage, n), material.settings.maxOutputTokens.classification, material.labels.batches[n]); }
catch (cause) { error = cause; process.exitCode = 1; }
finally { finishRun(run, error); }
