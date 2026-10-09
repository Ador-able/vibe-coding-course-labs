import {readFile,writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {Store} from './store.js';
import {workInput,workId,chapterNumber,draftInput,LabError} from './schemas.js';

const {values,positionals}=parseArgs({allowPositionals:true,options:{db:{type:'string',default:'data/novel.sqlite'},work:{type:'string',default:'clocktower'},output:{type:'string'}}});
const store=new Store(resolve(values.db!));
try{
  const id=workId.parse(values.work);
  const [command,arg]=positionals;
  let result:unknown;
  switch(command){
    case 'init':result=store.init(workInput.parse(JSON.parse(await readFile(arg??'seed/钟楼.json','utf8'))));break;
    case 'show':result={work:store.getWork(id),chapters:store.listChapters(id)};break;
    case 'chapter':result=store.getChapter(id,chapterNumber.parse(Number(arg)));break;
    case 'save':{
      if(!arg)throw new LabError('INPUT_REQUIRED','需要带修订基线的草稿 JSON 文件。');
      result=store.saveDraft(draftInput.parse(JSON.parse(await readFile(arg,'utf8'))),'human');break;
    }
    case 'task':if(!arg)throw new LabError('INPUT_REQUIRED','需要任务标识。');result=store.getTask(arg);break;
    default:throw new LabError('COMMAND','用法：pnpm lab init | show | chapter 1 | save 草稿.json | task 任务标识 [--db 路径] [--work clocktower]');
  }
  const text=JSON.stringify(result,null,2)+'\n';
  if(values.output)await writeFile(resolve(values.output),text,'utf8');
  else process.stdout.write(text);
}catch(error){console.error(JSON.stringify({code:error instanceof LabError?error.code:'INPUT_ERROR',message:error instanceof Error?error.message:String(error)}));process.exitCode=1;}
finally{store.close();}
