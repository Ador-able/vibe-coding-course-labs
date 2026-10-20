import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const root=fs.realpathSync(path.dirname(fileURLToPath(import.meta.url)));
const project=path.join(root,'project');
assert.equal(path.dirname(project),root);
assert.equal(fs.existsSync(project),false,'project已存在；请使用新的完整解压目录');
const fixed=JSON.parse(fs.readFileSync(path.join(root,'固定记录.json')));
const bundle=path.join(root,'fixtures/恢复范围代码.bundle');
const commands=[];
function git(args,cwd=project){const result=spawnSync('git',args,{cwd,encoding:'utf8',maxBuffer:30*1024*1024,windowsHide:true});commands.push({args,cwd,exitCode:result.status,stdout:result.stdout??'',stderr:result.stderr??''});fs.writeFileSync(path.join(root,'本次恢复命令.json'),JSON.stringify(commands,null,2)+'\n');assert.equal(result.status,0,'Git命令未完成：'+args.join(' '));return result.stdout;}
function snapshot(file){const db=new DatabaseSync(file,{readOnly:true});try{return JSON.parse(JSON.stringify(Object.fromEntries(['works','work_versions','chapters','chapter_versions','tasks'].map(t=>[t,db.prepare('SELECT * FROM '+t+' ORDER BY 1,2').all()]))));}finally{db.close();}}
try{
  git(['clone',bundle,project],root);
  git(['switch','--detach',fixed.personalCommit]);
  assert.equal(fs.realpathSync(git(['rev-parse','--show-toplevel']).trim()),fs.realpathSync(project));
  assert.equal(git(['rev-parse','HEAD']).trim(),fixed.personalCommit);
  git(['fetch',bundle,'refs/stash']);
  assert.equal(git(['rev-parse','FETCH_HEAD']).trim(),fixed.stashCommit);
  git(['stash','store','-m','本次恢复范围练习的已保存差异',fixed.stashCommit]);
  git(['stash','apply','stash@{0}']);
  assert.equal(git(['rev-parse','refs/stash']).trim(),fixed.stashCommit);
  const packageBytes=fs.readFileSync(path.join(project,'package.json'));
  const baseline=git(['show',fixed.fixedStart+':package.json']);
  assert.equal(packageBytes.toString('utf8').replace(/\r\n/g,'\n'),baseline.replace(/\r\n/g,'\n'));
  fs.mkdirSync(path.join(project,'data'),{recursive:true});
  fs.copyFileSync(path.join(root,'fixtures/最终业务一致备份.sqlite'),path.join(project,'data/recovery.sqlite'));
  fs.mkdirSync(path.join(project,'notes'),{recursive:true});
  fs.copyFileSync(path.join(root,'fixtures/本次观察.md'),path.join(project,'notes/本次观察.md'));
  const actual=snapshot(path.join(project,'data/recovery.sqlite'));
  const expected=JSON.parse(fs.readFileSync(path.join(root,'records/编辑后完整五表.json')));
  assert.deepEqual(actual,expected);
  const sourceManifest=JSON.parse(fs.readFileSync(path.join(root,'records/完整164源码核对.json')));
  const hash=b=>createHash('sha256').update(b).digest('hex');
  const names=git(['ls-files','-z']).split('\0').filter(Boolean);assert.equal(names.length,164);
  for(const file of sourceManifest){const args=['show',fixed.fixedStart+':'+file.path];const read=spawnSync('git',args,{cwd:project,maxBuffer:30*1024*1024,windowsHide:true});assert.equal(read.status,0,file.path);const raw=read.stdout;assert.equal(hash(raw),file.gitSha256,file.path);const working=fs.readFileSync(path.join(project,file.path));assert.equal(working.toString('utf8').replace(/\r\n/g,'\n'),raw.toString('utf8').replace(/\r\n/g,'\n'),file.path);commands.push({args,cwd:project,exitCode:read.status,stdoutBytes:raw.length,stdoutSha256:hash(raw),outputScope:'完整原字节仅计算摘要；内容在代码bundle中保留'});}
  fs.writeFileSync(path.join(root,'本次恢复命令.json'),JSON.stringify(commands,null,2)+'\n');
  const result={completed:true,project,head:fixed.personalCommit,workId:fixed.workId,chapter2Revision:JSON.parse(actual.chapters.find(x=>Number(x.number)===2).content).revision,fullFiveTablesEqual:true,sourceFiles:164,stashCommit:fixed.stashCommit,stashEntryCreatedAndKept:true,scope:'恢复本次教学结束点的代码工作文件、指定stash对象、单独业务备份与笔记；不创建另一个worktree、不恢复模型会话。',modelCalls:0,httpStarts:0,browserRuns:0,dependencyInstalls:0};
  fs.writeFileSync(path.join(root,'本次恢复结果.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}catch(error){fs.writeFileSync(path.join(root,'本次恢复失败.json'),JSON.stringify({message:error.message,commands},null,2)+'\n');console.error(error.stack);process.exitCode=1;}
