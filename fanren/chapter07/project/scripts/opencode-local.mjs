import {spawn,execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {parseArgs} from 'node:util';
import {homedir} from 'node:os';

const {values,positionals}=parseArgs({options:{out:{type:'string',default:'runs/opencode-command'},db:{type:'string',default:'data/fanren/plugin.sqlite'},'prompt-file':{type:'string'}},allowPositionals:true});
if(!positionals.length)throw new Error('需要原生 OpenCode 命令。');
const root=resolve(import.meta.dirname,'..'),cwd=resolve(root,'hosts/opencode');
const profile=resolve(root,'runs/opencode-profile'),out=resolve(root,values.out);
await mkdir(out,{recursive:true});
const env={...process.env};
// 使用本进程的独立配置与数据目录；不读取或复制其他宿主的登录文件。
for(const name of Object.keys(env).filter(name=>name.startsWith('OPENCODE_')))delete env[name];
const environmentOverrides={
  XDG_DATA_HOME:resolve(profile,'data'),XDG_CONFIG_HOME:resolve(profile,'config'),
  XDG_CACHE_HOME:resolve(profile,'cache'),XDG_STATE_HOME:resolve(profile,'state'),
  OPENCODE_CONFIG_DIR:resolve(profile,'config/opencode'),
  OPENCODE_DISABLE_EXTERNAL_SKILLS:'true',OPENCODE_DISABLE_CLAUDE_CODE:'true',
  OPENCODE_DISABLE_DEFAULT_PLUGINS:'true',OPENCODE_DISABLE_AUTOUPDATE:'true',NO_COLOR:'1',
};
Object.assign(env,environmentOverrides);
// 密钥只进入当前子进程；公开记录保留变量占位符，不保存值或认证文件。
let saved;
try{saved=JSON.parse(await readFile(resolve(homedir(),'.vibe-coding-labs/model.json'),'utf8'));}
catch{throw new Error('请先在请求观察室的模型设置中保存配置。');}
const apiKey=saved.apiKey;
if(!apiKey||!saved.baseUrl||!saved.model)throw new Error('请求观察室的模型设置不完整。');
env.API_KEY=apiKey;
const config=JSON.parse(await readFile(resolve(cwd,'opencode.json'),'utf8'));
// read 按 Git 工作树的相对路径判权限，方法目录则由宿主配置位置解析。
const worktree=execFileSync('git',['rev-parse','--show-toplevel'],{cwd:root,encoding:'utf8'}).trim();
config.permission.read={'*':'deny',...Object.fromEntries(config.skills.paths.map(path=>[relative(worktree,resolve(cwd,path,'*')),'allow']))};
// 本轮设置共用课程页面保存的地址与型号；密钥仍使用环境变量占位符。
config.provider.courseModel.options.baseURL=saved.baseUrl;
const selected=saved.model,limits={context:32768,output:4096};
config.provider.courseModel.models={[selected]:{name:selected,options:{},limit:limits}};
config.model=config.small_model='courseModel/'+selected;
config.mcp={novel_lab:{type:'local',command:[process.execPath,resolve(root,'dist/mcp.js'),resolve(root,values.db)],enabled:true}};
env.OPENCODE_CONFIG_CONTENT=JSON.stringify(config);
const entry=resolve(root,'node_modules/opencode-ai/bin/opencode.exe');
const prompt=values['prompt-file']?await readFile(resolve(root,values['prompt-file']),'utf8'):null;
await writeFile(resolve(out,'input.json'),JSON.stringify({entry,cwd,args:positionals,profile,config,prompt,credentialSource:'课程页面已保存设置；密钥只注入当前子进程',environmentOverrides:{...environmentOverrides,OPENCODE_CONFIG_CONTENT:'已完整记录于 config 字段'}},null,2));
const stdout=[],stderr=[];
let exitCode;
try{
  const child=spawn(entry,positionals,{cwd,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  child.stdin.end(prompt??undefined);
  child.stdout.on('data',chunk=>stdout.push(chunk));
  child.stderr.on('data',chunk=>stderr.push(chunk));
  exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
}catch(error){
  // 启动失败也保存原始原因，供观察入口读取，而非再报日志文件缺失。
  exitCode=1;
  stderr.push(Buffer.from(`OpenCode启动失败：${error.code??'ERROR'}: ${error.message}\n`));
}
let redactions=0;
const publicOutput=chunks=>{
  const raw=Buffer.concat(chunks).toString('utf8');
  if(!apiKey)return raw;
  redactions+=raw.split(apiKey).length-1;
  return raw.replaceAll(apiKey,'[本进程密钥已省略]');
};
const publicStdout=publicOutput(stdout),publicStderr=publicOutput(stderr);
await writeFile(resolve(out,'stdout.txt'),publicStdout);
await writeFile(resolve(out,'stderr.txt'),publicStderr);
await writeFile(resolve(out,'exit.json'),JSON.stringify({exitCode,redactions},null,2));
process.stdout.write(publicStdout);
process.stderr.write(publicStderr);
process.exitCode=exitCode??1;
