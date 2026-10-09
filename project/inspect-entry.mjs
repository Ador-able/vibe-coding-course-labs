import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Codex } from '@openai/codex-sdk';

const ownRequire = createRequire(import.meta.url);
const codexPackage = ownRequire.resolve('@openai/codex/package.json');
const cliRequire = createRequire(codexPackage);
const platformPackage = cliRequire.resolve('@openai/codex-win32-x64/package.json');
const sdkModule = fileURLToPath(import.meta.resolve('@openai/codex-sdk'));
const vendor = path.join(path.dirname(platformPackage), 'vendor', 'x86_64-pc-windows-msvc');
// 只观察 SDK 构造时解析的入口；不启动模型会话或改变配置。
const defaultCodex = new Codex();
const executable = defaultCodex.exec.executablePath;
const version = spawnSync(executable, ['--version'], { encoding: 'utf8', windowsHide: true });
const fileRecord = async (file) => {
  try {
    const bytes = await fs.readFile(file);
    return { path: file, exists: true, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  } catch (error) {
    return { path: file, exists: false, errorCode: error.code };
  }
};
const record = {
  observedAt: new Date().toISOString(), node: process.version,
  codexPackage: JSON.parse(await fs.readFile(codexPackage, 'utf8')).version,
  platformPackage: JSON.parse(await fs.readFile(platformPackage, 'utf8')).version,
  sdkFile: await fileRecord(sdkModule), cliLauncher: await fileRecord(path.join(path.dirname(codexPackage), 'bin', 'codex.js')),
  defaultSdkExecutable: await fileRecord(executable),
  actualVersion: { exitCode: version.status, stdout: version.stdout.trim(), stderr: version.stderr.trim() },
  packageMetadata: await fileRecord(path.join(vendor, 'codex-package.json')),
  wronglyAssumedOldExecutable: await fileRecord(path.join(vendor, 'codex', 'codex.exe')),
  helperPathReportedByActualFailedShell: await fileRecord(path.join(vendor, 'codex-resources', 'codex-windows-sandbox-setup.exe')),
  modelSessionsStartedByThisProbe: 0,
  conclusion: '默认 SDK 能解析已安装可选平台包的 bin/codex.exe。两个预运行定位错误出现在本练习脚本；实际只读 Shell 的辅助程序失败另行记录，不归为 SDK 默认入口失败。'
};
await fs.mkdir(new URL('./diagnostics/', import.meta.url), { recursive: true });
await fs.writeFile(new URL('./diagnostics/entry-readonly.json', import.meta.url), JSON.stringify(record, null, 2));
console.log(JSON.stringify(record, null, 2));
