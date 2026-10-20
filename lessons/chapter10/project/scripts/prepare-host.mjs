import './codex-environment.mjs';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {isDeepStrictEqual,parseArgs} from 'node:util';
import {currentPractice} from './practice-state.mjs';
import {pluginRuntime} from './plugin-runtime.mjs';

export async function prepareHost({taskId=null,excerpt=null,readOnly=false}={}){
  const practice=currentPractice(),root=process.cwd(),out=resolve('runs',`host-prepare-${randomUUID()}`);
  mkdirSync(out,{recursive:true});
  const binding={entry:resolve('dist/mcp.js'),database:resolve(practice.database),taskId,excerpt:excerpt?resolve(excerpt):null};
  writeFileSync('plugins/novel-workbench-course/binding.json',JSON.stringify(binding,null,2)+'\n');
  const read=file=>JSON.parse(readFileSync(file,'utf8'));
  const execute=(script,args,label)=>{
    const stdout=execFileSync(process.execPath,[`scripts/${script}.mjs`,...args],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
    writeFileSync(resolve(out,label+'.txt'),stdout);return stdout;
  };
  const globalConfig=resolve(process.env.USERPROFILE??process.env.HOME,'.codex/config.toml');
  const hash=()=>existsSync(globalConfig)?createHash('sha256').update(readFileSync(globalConfig)).digest('hex'):null;
  const globalBefore=hash(),catalog=JSON.parse(execute('plugin-catalog',[],'插件目录'));
  // 更新的只是本章私有宿主中的插件缓存，以匹配本次库、任务和人工选区。
  if(catalog.installed?.some(item=>item.pluginId==='novel-workbench-course@novel-workbench-course-lab'))execute('plugin-manage',['remove'],'移除本章旧绑定');
  execute('plugin-manage',['add'],'绑定本章插件');
  let report=null;
  for(let attempt=1;attempt<=2;attempt++){
    const directory=resolve(out,`preflight-${attempt}`);
    execute('plugin-preflight',[...(readOnly?['--read-only']:[]),'--out',directory],`目录核对-${attempt}`);
    report=read(resolve(directory,'report.json'));
    const current=await pluginRuntime(root,{readOnly});
    if(report.isolated&&report.skillsIsolated&&report.memoryIsolated&&report.bindingMatches&&isDeepStrictEqual(report.runtime,current.runtime))break;
    if(attempt===2)throw new Error('本章插件、Skill 或当前绑定未通过目录核对，请查看真实报告。');
  }
  if(globalBefore!==hash())throw new Error('宿主检查前后的全局配置不一致。');
  writeFileSync(resolve(out,'report.json'),JSON.stringify({out,binding,readOnly,ready:true,modelTasks:0,globalConfigUnchanged:true,scope:'仅插件绑定和公开目录检查；未发送模型任务。'},null,2)+'\n');
  return {out,binding,readOnly,report};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const {values}=parseArgs({options:{'read-only':{type:'boolean',default:false}}});
  const result=await prepareHost({readOnly:values['read-only']});console.log(JSON.stringify({out:result.out,ready:true,modelTasks:0,toolSummary:result.report.toolSummary,skills:result.report.enabledSkillNames}));
}
