import {readFile,writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {Store} from './store.js';
import {workInput,workId,chapterNumber,draftInput,LabError} from './schemas.js';
import {z} from 'zod';

const {values,positionals}=parseArgs({allowPositionals:true,options:{db:{type:'string',default:'data/01/novel.sqlite'},work:{type:'string',default:'fanren'},output:{type:'string'},'expected-revision':{type:'string'},note:{type:'string'}}});
const store=new Store(resolve(values.db!));
try{
  const id=workId.parse(values.work);
  const [command,arg]=positionals;
  let result:unknown;
  switch(command){
    case 'init':result=store.init(workInput.parse(JSON.parse(await readFile(arg??'seed/凡人修仙传.json','utf8'))));break;
    case 'show':result={work:store.getWork(id),chapters:store.listChapters(id)};break;
    case 'chapter':result=store.getChapter(id,chapterNumber.parse(Number(arg)));break;
    case 'work-version':result=store.getWorkVersion(id,z.number().int().positive().parse(Number(arg)));break;
    case 'save':{
      if(!arg)throw new LabError('INPUT_REQUIRED','需要带修订基线的草稿 JSON 文件。');
      result=store.saveDraft(draftInput.parse(JSON.parse(await readFile(arg,'utf8'))),'human');break;
    }
    case 'update':{
      if(!arg)throw new LabError('INPUT_REQUIRED','需要新的完整作品要求 JSON。');
      const input=workInput.parse(JSON.parse(await readFile(arg,'utf8')));
      if(input.id!==id)throw new LabError('WORK_MISMATCH','文件作品与 --work 不一致。');
      result=store.updateWork(input,z.number().int().positive().parse(Number(values['expected-revision'])));break;
    }
    case 'adopt':result=store.adopt(id,chapterNumber.parse(Number(arg)),z.number().int().positive().parse(Number(values['expected-revision'])),z.string().trim().min(1).parse(values.note));break;
    case 'export':{
      if(!arg)throw new LabError('INPUT_REQUIRED','需要导出 Markdown 文件路径。');
      const exported=store.exportWork(id);
      await writeFile(resolve(arg),exported.text,'utf8');
      const {text,...summary}=exported;result={...summary,path:resolve(arg)};break;
    }
    case 'task':if(!arg)throw new LabError('INPUT_REQUIRED','需要任务标识。');result=store.getTask(arg);break;
    default:throw new LabError('COMMAND','用法：pnpm lab init | show | chapter 1 | save 草稿.json | update 要求.json --expected-revision N | adopt 1 --expected-revision N --note 理由 | export 草稿.md | task 任务标识 [--db 路径] [--work fanren]');
  }
  const text=JSON.stringify(result,null,2)+'\n';
  if(values.output)await writeFile(resolve(values.output),text,'utf8');
  else process.stdout.write(text);
}catch(error){console.error(JSON.stringify({code:error instanceof LabError?error.code:'INPUT_ERROR',message:error instanceof Error?error.message:String(error)}));process.exitCode=1;}
finally{store.close();}
