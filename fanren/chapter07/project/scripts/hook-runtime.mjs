import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pluginRuntime} from './plugin-runtime.mjs';

export async function hookRuntime(root,{executeHooks=false}={}){
 const {runtime,settings}=await pluginRuntime(root);
 const quote=value=>JSON.stringify(value),database=resolve(root,'data/fanren/hook.sqlite');
 const overrides=[...runtime.configOverrides,
  `plugins.${settings.pluginId}.enabled=false`,
  `projects={${quote(process.platform==='win32'?root.toLowerCase():root)}={trust_level="trusted"}}`,
  `mcp_servers.${settings.serverName}={command=${quote(process.execPath)},args=[${quote(resolve(root,'dist/mcp.js'))},${quote(database)}],cwd=${quote(root)},enabled=true,required=true,enabled_tools=[${settings.enabledTools.map(quote).join(',')}],default_tools_approval_mode="approve"}`,
  `features.hooks=${executeHooks}`,
  'features.shell_tool=false',
  'web_search="disabled"',
 ];
 if(executeHooks){
  const review=JSON.parse(await readFile(resolve(root,'runs/hook-trust-review.json'),'utf8'));
  overrides.push(...review.overrides);
 }
 return{settings,runtime:{configOverrides:overrides},database};
}
