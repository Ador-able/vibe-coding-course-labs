import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {parseArgs} from 'node:util';
import {execFileSync} from 'node:child_process';
import {Store} from '../dist/store.js';

const {values}=parseArgs({options:{folder:{type:'string',default:'task-state'},output:{type:'string'}}});
if(!values.output)throw new Error('请提供独立记录文件 --output。');
const task=JSON.parse(await readFile(resolve(values.folder,'task.json'),'utf8')),store=new Store(resolve(task.db));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
  const tables=Object.fromEntries(['works','work_versions','chapters','chapter_versions','tasks'].map(name=>[name,store.db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]));
  const work=store.getWork(task.id),chapters=store.listChapters(task.id).map(ch=>store.getChapter(task.id,ch.number)),exported=store.exportWork(task.id);
  const files={};
  for(const name of [task.deliverable,task.review,task.progress,`${task.folder}/任务说明.md`]){
    try{const bytes=await readFile(name),info=await stat(name);files[name]={exists:true,bytes:bytes.length,sha256:sha(bytes),mtime:info.mtime.toISOString(),text:bytes.toString('utf8')};}
    catch(error){if(error.code!=='ENOENT')throw error;files[name]={exists:false};}
  }
  const delivery=files[task.deliverable];
  const report={capturedAt:new Date().toISOString(),codeVersion:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),gitStatus:execFileSync('git',['status','--short'],{encoding:'utf8'}),task,work,chapters,tables,exported,files,deliveryByteEqual:delivery.exists?delivery.sha256===sha(Buffer.from(exported.text,'utf8')):null,scope:'独立读取完整 Store、五表与实际文件；记录实验状态，不执行任务或替代人工文学判断。'};
  await mkdir(dirname(resolve(values.output)),{recursive:true});await writeFile(resolve(values.output),JSON.stringify(report,null,2));
  console.log(JSON.stringify({output:values.output,codeVersion:report.codeVersion,counts:Object.fromEntries(Object.entries(tables).map(([key,rows])=>[key,rows.length])),deliveryExists:delivery.exists,deliveryByteEqual:report.deliveryByteEqual}));
}finally{store.close();}
