import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export async function pluginRuntime(root){
  const settings=JSON.parse(await readFile(resolve(root,'config/plugin-check.json'),'utf8'));
  let isolation=[];
  try{isolation=JSON.parse(await readFile(resolve(root,'runs/plugin-isolation.json'),'utf8')).overrides;}
  catch(error){if(error.code!=='ENOENT')throw error;}
  let skills=[];
  try{skills=JSON.parse(await readFile(resolve(root,'runs/skill-isolation.json'),'utf8')).entries;}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const quote=value=>JSON.stringify(value);
  const overrides=[
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
    `skills.config=[${skills.map(item=>`{path=${quote(item.path)},enabled=false}`).join(',')}]`,
  ];
  return {settings,runtime:{configOverrides:overrides},threadOptions:{workingDirectory:root,sandboxMode:settings.sandboxMode,approvalPolicy:settings.approvalPolicy,webSearchMode:settings.webSearchMode}};
}
