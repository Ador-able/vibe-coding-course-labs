import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {root,loadBaseline,statePath,readState,snapshotFiles,writeExclusive,json} from './records.mjs';

if(process.argv.length>4)throw new Error('用法：node read-state.mjs state/history-01 runs/read-01.json');
const directory=statePath(process.argv[2]),receipt=resolve(root,process.argv[3]??'runs/read-01.json');
assert.ok(!receipt.startsWith(directory+'/')&&!receipt.startsWith(directory+'\\'),'只读回执不能写入状态目录');
const before=await snapshotFiles(directory),baseline=await loadBaseline(),state=await readState(directory);
const after=await snapshotFiles(directory);assert.deepEqual(after,before);
// 完整输入与所有 attempt 原件放进读取回执，入口只依赖 Node 内置文件 API。
const result={readAt:new Date().toISOString(),sourceIds:state.plan.sourceIds,state,files:before,originalFiles:baseline.files,stateBytesUnchanged:true,
 scope:'保存后由新的只读进程取得现状；未测试中途崩溃恢复，不读取API_KEY，不进入SDK、供应商或HTTP。'};
await writeExclusive(receipt,result);
console.log(json(result));
