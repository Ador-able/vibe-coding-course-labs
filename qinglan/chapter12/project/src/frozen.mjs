import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root, readJson, sha256 } from './materials.mjs';

export function checkTeaching() {
  const manifest = readJson(path.join(root, 'inputs/冻结清单.json'));
  for (const file of manifest.files) {
    const bytes = fs.readFileSync(path.join(root, 'inputs', file.file));
    assert.equal(bytes.length, file.bytes, file.file); assert.equal(sha256(bytes), file.sha256, file.file);
  }
  return manifest;
}
export function checkSource() {
  const version = readJson(path.join(root, 'source-version.json'));
  for (const file of version.files) {
    const bytes = fs.readFileSync(path.join(root, file.name));
    assert.equal(bytes.length, file.bytes, file.name); assert.equal(sha256(bytes), file.sha256, `源码已改变：${file.name}`);
  }
  return version;
}
