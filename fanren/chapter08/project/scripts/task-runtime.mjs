import './codex-environment.mjs';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';

// 三个任务共用本机登录与模型选择；配置仅作用于本实验进程。
export function taskRuntime(){
  const root=resolve(process.cwd());
  return {
    runtime:{configOverrides:[
      `projects={${JSON.stringify(process.platform==='win32'?root.toLowerCase():root)}={trust_level="trusted"}}`,
      'memories.use_memories=false','memories.generate_memories=false','features.memories=false',
      'project_doc_max_bytes=0','developer_instructions=""','skills.bundled.enabled=false','features.hooks=false',
      `mcp_servers.codex_apps={command=${JSON.stringify(process.execPath)},args=[],enabled=false}`,
    ]},
    options:{workingDirectory:root,skipGitRepoCheck:true,sandboxMode:'workspace-write',approvalPolicy:'never',webSearchMode:'disabled'},
  };
}

export function checkedTaskRuntime(){
  const current=taskRuntime(),checked=JSON.parse(readFileSync('runs/host-preflight/report.json','utf8'));
  if(!checked.ready||!isDeepStrictEqual(current.runtime,checked.runtime)||!isDeepStrictEqual(current.options,checked.options))throw new Error('当前宿主配置尚未通过检查，请先运行 pnpm host:check。');
  return current;
}
