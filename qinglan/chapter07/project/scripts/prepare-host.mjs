import './codex-environment.mjs';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {pluginRuntime} from './plugin-runtime.mjs';
import {skillRuntime} from './skill-runtime.mjs';

const scenario=process.argv[2];
if(!['reading','plugin','skill','hook','feedback'].includes(scenario))throw new Error('需要当前练习名称。');
const root=process.cwd(),out=resolve('runs',`host-prepare-${scenario}-${randomUUID()}`);
mkdirSync(out,{recursive:true});
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const save=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n');
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const globalConfig=resolve(process.env.USERPROFILE??process.env.HOME,'.codex/config.toml');
const globalBefore=existsSync(globalConfig)?sha(globalConfig):null;
const execute=(script,args,label)=>{
  const stdout=execFileSync(process.execPath,[`scripts/${script}.mjs`,...args],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
  writeFileSync(resolve(out,label+'.stdout.txt'),stdout);return stdout;
};
if(['reading','plugin'].includes(scenario)){
  const catalog=JSON.parse(execute('plugin-catalog',[],'安装目录'));
  const installed=catalog.installed?.find(item=>item.pluginId==='novel-workbench-course@novel-workbench-course-lab');
  // 只有本章独立 CODEX_HOME 中的缓存可更新，不操作用户已有插件。
  if(installed)execute('plugin-manage',['remove'],'移除本章旧绑定');
  execute('plugin-manage',['add'],'安装本章绑定');
}
if(['hook','feedback'].includes(scenario)){
  const approved=read('config/hooks-reviewed.json');
  for(const file of approved.definitionFiles)if(sha(file.path)!==file.sha256)throw new Error(`固定检查文件已改变：${file.path}`);
  if(existsSync(approved.missingTarget))throw new Error('缺失脚本对照的目标已存在，不能继续原实验。');
  const selected=scenario==='hook'?'config/hooks-对照.json':'config/hooks-反馈.json';
  if(sha('.codex/hooks.json')!==sha(selected))throw new Error('先准备当前练习的Hook定义。');
  const directory=resolve(out,'hooks-directory');
  execute(scenario==='hook'?'hook-preflight':'feedback-preflight',['--directory-only','--out',directory],'Hook目录');
  const catalog=read(resolve(directory,'hooks.json')).data.find(item=>resolve(item.cwd)===root);
  const expected=read(selected).hooks.PostToolUse.flatMap(entry=>entry.hooks.map(hook=>({matcher:entry.matcher,command:hook.command})));
  if(!catalog||catalog.errors.length||catalog.hooks.length!==expected.length||catalog.hooks.some((hook,index)=>hook.source!=='project'||resolve(hook.sourcePath)!==resolve('.codex/hooks.json')||hook.matcher!==expected[index].matcher||hook.command!==expected[index].command))throw new Error('实际Hook目录不同于已核对的固定定义。');
  const approvedHooks=catalog.hooks.map(({key,currentHash,matcher,command})=>({key,currentHash,matcher,command}));
  const definitionFiles=[...approved.definitionFiles,{path:'.codex/hooks.json',sha256:sha('.codex/hooks.json')}];
  const overrides=[`hooks.state={${approvedHooks.map(item=>`${JSON.stringify(item.key)}={enabled=true,trusted_hash=${JSON.stringify(item.currentHash)}}`).join(',')}}`];
  save(resolve('runs',scenario==='hook'?'hook-trust-review.json':'feedback-trust-review.json'),{approvedBy:approved.approvedBy,definitionFiles,approvedHooks,overrides,scope:'固定脚本哈希与本次实际目录相符；信任仅传给当前宿主进程。'});
}
let finalReport=null;
// 首次发现实际目录，下一次用发现结果关闭无关项；无需手改用户配置。
for(let attempt=1;attempt<=3;attempt++){
  const directory=resolve(out,`preflight-${attempt}`);
  if(scenario==='skill'){
    execute('skill-catalog',['--check-tools','--out',directory],`预检-${attempt}`);
    finalReport=read('runs/skill-preflight.json');
    const current=await skillRuntime(root,resolve(directory,'catalog-workbench.sqlite'));
    if(finalReport.isolated&&isDeepStrictEqual(current.runtime.configOverrides.slice(1),finalReport.overrides))break;
  }else if(['reading','plugin'].includes(scenario)){
    execute('plugin-preflight',[...(scenario==='reading'?['--read-only']:[]),'--out',directory],`预检-${attempt}`);
    finalReport=read(resolve(directory,'report.json'));
    const current=await pluginRuntime(root,{readOnly:scenario==='reading'});
    if(finalReport.isolated&&finalReport.skillsIsolated&&finalReport.memoryIsolated&&finalReport.bindingMatches&&isDeepStrictEqual(current.runtime,finalReport.runtime))break;
  }else{
    execute(scenario==='hook'?'hook-preflight':'feedback-preflight',[...(scenario==='feedback'?['--trusted']:[]),'--out',directory],`预检-${attempt}`);
    finalReport=read(resolve(directory,'report.json'));
    if((finalReport.isolated||finalReport.mcpIsolated)&&finalReport.skillsIsolated&&finalReport.memoryIsolated)break;
  }
  if(attempt===3)throw new Error('实际目录仍未满足本练习范围，检查已保存的预检结果。');
}
const globalAfter=existsSync(globalConfig)?sha(globalConfig):null;
const report={scenario,out,modelCalls:0,globalConfigUnchanged:globalBefore===globalAfter,globalConfigHashBefore:globalBefore,globalConfigHashAfter:globalAfter,ready:true,limits:'仅安装本章隔离插件、读取实际目录并准备本次进程配置；尚未发送模型任务。登录文件保留在私有运行目录，不进入交付。'};
save(resolve(out,'report.json'),report);console.log(JSON.stringify(report));
