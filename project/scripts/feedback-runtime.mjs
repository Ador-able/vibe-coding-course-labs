import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export async function feedbackRuntime(root,{executeHooks=false,directoryHooks=false}={}){
 const settings=JSON.parse(await readFile(resolve(root,'config/feedback-check.json'),'utf8'));
 let isolation=[];
 try{isolation=JSON.parse(await readFile(resolve(root,'runs/feedback-isolation.json'),'utf8')).overrides;}
 catch(error){if(error.code!=='ENOENT')throw error;}
 let skills=[];
 try{skills=JSON.parse(await readFile(resolve(root,'runs/feedback-skill-isolation.json'),'utf8')).entries;}
 catch(error){if(error.code!=='ENOENT')throw error;}
 const quote=value=>JSON.stringify(value),database=resolve(root,settings.database);
 const configOverrides=[
  `model=${quote(settings.model)}`,
  'plugins.novel-workbench-course@novel-workbench-course-lab.enabled=false',
  `projects={${quote(process.platform==='win32'?root.toLowerCase():root)}={trust_level="trusted"}}`,
  ...isolation,
  `mcp_servers.${settings.serverName}={command=${quote(process.execPath)},args=[${quote(resolve(root,'dist/mcp.js'))},${quote(database)}],cwd=${quote(root)},enabled=true,required=true,enabled_tools=[${settings.enabledTools.map(quote).join(',')}],default_tools_approval_mode="approve"}`,
  'memories.use_memories=false',
  'memories.generate_memories=false',
  'features.memories=false',
  'project_doc_max_bytes=0',
  'developer_instructions=""',
  'skills.bundled.enabled=false',
  `skills.config=[${skills.map(item=>`{path=${quote(item.path)},enabled=false}`).join(',')}]`,
  'features.shell_tool=true',
  'web_search="disabled"',
  `features.hooks=${executeHooks||directoryHooks}`,
 ];
 if(executeHooks){
  const review=JSON.parse(await readFile(resolve(root,'runs/feedback-trust-review.json'),'utf8'));
  if(review.approvedBy!=='root'||review.approvedHooks?.length!==1)throw new Error('当前项目的唯一Hook尚未由主编审核信任。');
  configOverrides.push(...review.overrides);
 }
 return {settings,runtime:{configOverrides},database};
}

// 只公布实验需要的配置开关，不收录宿主指令、身份或无关配置正文。
export function configurationProjection(result,root){
 const config=result.config;
 return {
  model:config.model,
  features:config.features,
  memories:config.memories,
  skills:config.skills,
  project_doc_max_bytes:config.project_doc_max_bytes,
  developerInstructionsPresent:!!config.developer_instructions,
  projectTrust:Object.entries(config.projects??{}).filter(([key])=>resolve(key).toLowerCase()===root.toLowerCase()),
  limits:'配置仅保留本实验开关与项目路径；宿主system/developer、身份和记忆受保护正文不收录。',
 };
}
