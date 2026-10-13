import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export async function pluginRuntime(root,{readOnly=false}={}){
  const settings=JSON.parse(await readFile(resolve(root,'config/plugin-check.json'),'utf8'));
  const binding=JSON.parse(await readFile(resolve(root,'plugins/novel-workbench-course/binding.json'),'utf8'));
  if(binding.excerpt)settings.enabledTools=settings.enabledTools.map(name=>name==='save_draft'?'revise_excerpt':name);
  if(readOnly)settings.enabledTools=settings.enabledTools.filter(name=>!['save_draft','revise_excerpt'].includes(name));
  let isolation=[];
  try{isolation=JSON.parse(await readFile(resolve(root,'runs/plugin-isolation.json'),'utf8')).overrides;}
  catch(error){if(error.code!=='ENOENT')throw error;}
  let skills=[];
  try{skills=JSON.parse(await readFile(resolve(root,'runs/skill-isolation.json'),'utf8')).entries;}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const quote=value=>JSON.stringify(value);
  const overrides=[
    `projects={${quote(process.platform==='win32'?root.toLowerCase():root)}={trust_level="trusted"}}`,
    `marketplaces.${settings.marketplaceName}.source=${quote(root)}`,
    `marketplaces.${settings.marketplaceName}.source_type="local"`,
    `plugins.${settings.pluginId}.enabled=true`,
    `plugins.${settings.pluginId}.mcp_servers.${settings.serverName}.enabled_tools=[${settings.enabledTools.map(quote).join(',')}]`,
    `plugins.${settings.pluginId}.mcp_servers.${settings.serverName}.default_tools_approval_mode="approve"`,
    ...isolation,
    'memories.use_memories=false',
    'memories.generate_memories=false',
    'features.memories=false',
    'project_doc_max_bytes=0',
    'developer_instructions=""',
    'skills.bundled.enabled=false',
    'features.hooks=false',
    `mcp_servers.codex_apps={command=${quote(process.execPath)},args=[],enabled=false}`,
    `skills.config=[${skills.map(item=>`{path=${quote(item.path)},enabled=false}`).join(',')}]`,
  ];
  return {settings,runtime:{configOverrides:overrides},threadOptions:{workingDirectory:root,skipGitRepoCheck:true,sandboxMode:settings.sandboxMode,approvalPolicy:settings.approvalPolicy,webSearchMode:settings.webSearchMode}};
}
import './codex-environment.mjs';
