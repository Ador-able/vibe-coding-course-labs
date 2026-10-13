import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';

export async function skillRuntime(root,database){
  const settings=JSON.parse(await readFile(resolve(root,'config/skill-check.json'),'utf8'));
  const quote=value=>JSON.stringify(value);
  // 保留各连接的有效传输配置，只在本次进程关闭无关连接并设置本实验入口。
  const mcpTable=`mcp_servers.${settings.serverName}={command=${quote(process.execPath)},args=[${quote(resolve(root,'dist/mcp.js'))},${quote(database)}],cwd=${quote(root)},enabled=true,required=true,enabled_tools=[${settings.enabledTools.map(quote).join(',')}],default_tools_approval_mode="approve"}`;
  let isolation={overrides:[],entries:[]};
  try{isolation=JSON.parse(await readFile(resolve(root,'runs/chapter-skill-isolation.json'),'utf8'));}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const runtime={configOverrides:[mcpTable,...isolation.overrides,
    `projects={${quote(process.platform==='win32'?root.toLowerCase():root)}={trust_level="trusted"}}`,
    'plugins.novel-workbench-course@novel-workbench-course-lab.enabled=false',
    'memories.use_memories=false','memories.generate_memories=false','features.memories=false',
    'project_doc_max_bytes=0','developer_instructions=""','skills.bundled.enabled=false','features.hooks=false',
    `skills.config=[${isolation.entries.map(item=>`{path=${quote(item.path)},enabled=false}`).join(',')}]`,
  ]};
  const threadOptions={workingDirectory:root,skipGitRepoCheck:true,sandboxMode:settings.sandboxMode,approvalPolicy:settings.approvalPolicy,webSearchMode:settings.webSearchMode};
  return {settings,runtime,threadOptions};
}
import './codex-environment.mjs';
