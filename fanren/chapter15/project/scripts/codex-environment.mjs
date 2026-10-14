import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

export function codexEnvironment(){
  const sourceHome=process.env.CODEX_HOME??resolve(process.env.USERPROFILE??process.env.HOME,'.codex');
  const home=resolve('runs/private-codex-home');mkdirSync(home,{recursive:true});
  const auth=resolve(home,'auth.json');
  // 登录只在本机复用，公开记录不包含认证原件。
  if(!existsSync(auth)&&existsSync(resolve(sourceHome,'auth.json')))writeFileSync(auth,readFileSync(resolve(sourceHome,'auth.json')),{flag:'wx',mode:0o600});
  const target=resolve(home,'config.toml');
  if(!existsSync(target)){
    const source=existsSync(resolve(sourceHome,'config.toml'))?readFileSync(resolve(sourceHome,'config.toml'),'utf8'):'';
    const top=source.split(/^\s*\[/m)[0],selection=top.split(/\r?\n/).filter(line=>/^(model|model_provider|model_reasoning_effort)\s*=/.test(line)).join('\n');
    const windows=source.split(/^\s*\[windows\]\s*$/m)[1]?.split(/^\s*\[/m)[0]??'';
    const sandbox=windows.match(/^\s*sandbox\s*=\s*"(elevated|unelevated|mxc)"\s*$/m)?.[1];
    writeFileSync(target,selection+'\n'+(process.platform==='win32'&&sandbox?`\n[windows]\nsandbox = "${sandbox}"\n`:''),{flag:'wx'});
  }
  return {...process.env,CODEX_HOME:home};
}
