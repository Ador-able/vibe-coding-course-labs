import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const {values}=parseArgs({options:{phase:{type:'string'},db:{type:'string'},prompt:{type:'string'}}});
if(!values.phase||!values.db||!values.prompt)throw new Error('需要本轮阶段、独立数据库和已经固定的完整提示文件。');
const phases=JSON.parse(await readFile('config/heldout-phases.json','utf8'));
const phase=phases.phases[values.phase];
if(!phase)throw new Error('阶段只允许A、B或C。');
const promptPath=resolve(values.prompt),prompt=await readFile(promptPath);
if(!prompt.toString('utf8').trim())throw new Error('完整输入不能为空；B/C要先从实际前置对象确定。');

// 复用原有绑定入口核对已创建的Task；本脚本不新建作品或Task。
const argv=['scripts/prepare-plugin.mjs','--db',resolve(values.db),'--task',phase.taskId];
const bound=spawnSync(process.execPath,argv,{cwd:process.cwd(),encoding:'utf8',windowsHide:true});
const command={executable:process.execPath,argv,cwd:process.cwd(),status:bound.status,signal:bound.signal,error:bound.error?.message??null,stdout:bound.stdout??'',stderr:bound.stderr??''};
if(bound.status!==0||bound.error){
  console.error(JSON.stringify({phase:values.phase,command}));
  process.exitCode=1;
}else{
  const settings=JSON.parse(await readFile('config/plugin-check.json','utf8'));
  const plugin=JSON.parse(await readFile('plugins/novel-workbench-course/plugin.json','utf8'));
  settings.enabledTools=phase.enabledTools;
  plugin.version=phase.pluginVersion;
  await writeFile('config/plugin-check.json',JSON.stringify(settings,null,2)+'\n');
  await writeFile('plugins/novel-workbench-course/plugin.json',JSON.stringify(plugin,null,2)+'\n');
  const binding=JSON.parse(await readFile('plugins/novel-workbench-course/binding.json','utf8'));
  console.log(JSON.stringify({phase:values.phase,workId:phases.workId,chapterNumber:phase.chapterNumber,taskId:phase.taskId,pluginVersion:plugin.version,enabledTools:settings.enabledTools,binding,prompt:{path:promptPath,bytes:prompt.length,sha256:createHash('sha256').update(prompt).digest('hex')},command,limits:'只准备自有源版本、进程工具配置和业务绑定；真实缓存更新、宿主采用及业务动作必须另外观察。'},null,2));
}
