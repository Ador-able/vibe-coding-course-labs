import { createRun, finishRun } from '../src/files.mjs';
import { teaching } from '../src/teaching.mjs';
import { modelRecorder } from '../src/model.mjs';

const material = teaching(), run = createRun('templates', process.argv[2]), answer = modelRecorder(run, 2);
let error;
for (const version of ['V1', 'V2']) {
  try { await answer(version, material.templateInput(version), material.settings.maxOutputTokens.templateComparison, material.logs.scope.templateComparison); }
  catch (cause) { error = cause; process.exitCode = 1; }
}
finishRun(run, error);
