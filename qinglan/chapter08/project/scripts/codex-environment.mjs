import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const sourceHome=process.env.CODEX_HOME??resolve(process.env.USERPROFILE??process.env.HOME,'.codex');
const home=resolve(root,'runs/private-codex-home');
mkdirSync(home,{recursive:true});
// 本章只复用登录和模型选择；插件缓存、会话和配置留在独立目录。
const auth=resolve(home,'auth.json');
if(!existsSync(auth)&&existsSync(resolve(sourceHome,'auth.json')))writeFileSync(auth,readFileSync(resolve(sourceHome,'auth.json')),{flag:'wx',mode:0o600});
const config=resolve(home,'config.toml');
const sourceConfig=existsSync(resolve(sourceHome,'config.toml'))?readFileSync(resolve(sourceHome,'config.toml'),'utf8'):'';
if(!existsSync(config)){
  let selection='';
  if(sourceConfig){
    const top=sourceConfig.split(/^\s*\[/m)[0];
    selection=top.split(/\r?\n/).filter(line=>/^(model|model_provider|model_reasoning_effort)\s*=/.test(line)).join('\n');
  }
  writeFileSync(config,selection+'\n',{flag:'wx'});
}
// 沿用本机已经配置的 Windows 沙箱实现，不复制安全状态或调整权限边界。
const windowsSection=sourceConfig.split(/^\s*\[windows\]\s*$/m)[1]?.split(/^\s*\[/m)[0]??'';
const sandbox=windowsSection.match(/^\s*sandbox\s*=\s*"(elevated|unelevated|mxc)"\s*$/m)?.[1];
if(process.platform==='win32'&&sandbox&&!/^\s*\[windows\]\s*$/m.test(readFileSync(config,'utf8'))){
  writeFileSync(config,readFileSync(config,'utf8')+`\n[windows]\nsandbox = "${sandbox}"\n`);
}
process.env.CODEX_HOME=home;
