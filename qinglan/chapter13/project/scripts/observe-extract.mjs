import { createRun, finishRun } from '../src/files.mjs';
import { teaching } from '../src/teaching.mjs';
import { modelRecorder } from '../src/model.mjs';

const material = teaching(), run = createRun('extraction', process.argv[2]), answer = modelRecorder(run, 1);
let error;
try { await answer('extract', material.extractionInput, material.settings.maxOutputTokens.extraction, material.logs.scope.extraction); }
catch (cause) { error = cause; process.exitCode = 1; }
finally { finishRun(run, error); }
