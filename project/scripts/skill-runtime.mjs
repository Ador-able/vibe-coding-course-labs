import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';

export async function skillRuntime(root,database){
  const settings=JSON.parse(await readFile(resolve(root,'config/skill-check.json'),'utf8'));
  const quote=value=>JSON.stringify(value);
  // 保留各连接的有效传输配置，只在本次进程关闭无关连接并设置本实验入口。
  const mcpTable=`mcp_servers.${settings.serverName}={command=${quote(process.execPath)},args=[${quote(resolve(root,'dist/mcp.js'))},${quote(database)}],cwd=${quote(root)},enabled=true,required=true,enabled_tools=[${settings.enabledTools.map(quote).join(',')}],default_tools_approval_mode="approve"}`;
  let isolation=[];
  try{isolation=JSON.parse(await readFile(resolve(root,'runs/skill-isolation.json'),'utf8')).overrides;}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const runtime={config:{plugins:{'novel-practice@novel-agent-lab':{enabled:false}}},configOverrides:[mcpTable,...isolation]};
  const threadOptions={workingDirectory:root,sandboxMode:settings.sandboxMode,approvalPolicy:settings.approvalPolicy,webSearchMode:settings.webSearchMode};
  return {settings,runtime,threadOptions};
}
