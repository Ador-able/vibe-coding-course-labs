import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Store} from '../dist/store.js';
import {workInput} from '../dist/schemas.js';

const scenario=process.argv[2];
if(!['reading','plugin','hook','feedback'].includes(scenario))throw new Error('请选择 reading、plugin、hook 或 feedback。');
const database=resolve('data/fanren',`${scenario}.sqlite`),out=resolve('runs',`prepare-${scenario}`);
const existing=existsSync(database);
mkdirSync(out,{recursive:true});
const read=path=>readFileSync(path,'utf8');
const json=path=>JSON.parse(read(path));
const save=(path,value)=>writeFileSync(resolve(out,path),JSON.stringify(value,null,2)+'\n');
const events=[];
const record=(operation,input,result)=>{events.push({operation,input,result});save('实际保存步骤.json',events);return result;};
if(!existing&&scenario==='feedback'){
  writeFileSync('.codex/hooks.json',read('config/hooks-反馈.json'));
  execFileSync(process.execPath,['scripts/prepare-feedback.mjs'],{stdio:'inherit',windowsHide:true});
}else if(!existing){
  const store=new Store(database);
  try{
    if(scenario==='reading'){
      const firstWork=workInput.parse(json('materials/作品-r1.json'));
      let work=record('init',firstWork,store.init(firstWork));
      const draft=(path,number,expectedChapterRevision)=>{
        const markdown=read(path).replaceAll('\r\n','\n');
        const separator=markdown.indexOf('\n\n');
        const input={workId:work.id,chapterNumber:number,expectedWorkRevision:work.revision,expectedChapterRevision,expectedPreviousRevisions:store.listChapters(work.id).filter(chapter=>chapter.number<number).map(({number,revision})=>({number,revision})),title:markdown.slice(0,separator).replace(/^# /,''),body:markdown.slice(separator+2).trimEnd()};
        return record('saveDraft',{source:path,...input},store.saveDraft(input,'human'));
      };
      const first=draft('materials/第一章-r1.md',1,0);
      const updated=workInput.parse(json('materials/作品-r2.json'));
      work=record('updateWork',updated,store.updateWork(updated,work.revision));
      const edited=draft('materials/第一章-r2.md',1,first.revision);
      const note='编者用于读取与状态练习的教学采用，不代表文学质量或读者认可。';
      record('adopt',{workId:work.id,number:1,revision:edited.revision,note},store.adopt(work.id,1,edited.revision,note));
      draft('materials/第二章-教学候选.md',2,0);
      draft('materials/第三章-教学候选.md',3,0);
    }else{
      const path=scenario==='plugin'?'materials/插件起草-作品.json':'seed/竹林局部检查.json';
      const work=workInput.parse(json(path));
      record('init',{source:path,...work},store.init(work));
    }
  }finally{store.close();}
}
if(['hook','feedback'].includes(scenario))writeFileSync('.codex/hooks.json',read(scenario==='hook'?'config/hooks-对照.json':'config/hooks-反馈.json'));
// 关闭准备连接后独立打开业务库，保存真实全文与修订。
const reopened=new Store(database);
let current;
try{current={work:reopened.getWork('fanren'),chapters:reopened.listChapters('fanren').map(chapter=>reopened.getChapter('fanren',chapter.number))};}
finally{reopened.close();}
save('完整当前对象.json',current);
if(['reading','plugin'].includes(scenario))execFileSync(process.execPath,['scripts/prepare-plugin.mjs','--db',database],{stdio:'inherit',windowsHide:true});
const report={scenario,database,out,existing,modelCalls:0,currentWorkRevision:current.work.revision,chapters:current.chapters.map(({number,revision,status})=>({number,revision,status})),hookDefinitionSha256:['hook','feedback'].includes(scenario)?createHash('sha256').update(read('.codex/hooks.json')).digest('hex'):null,limits:'新库导入人工材料，已有库保持实际内容，只切换当前练习入口。当前项目的Hook定义只在准备相应练习时切换；任务运行中不要切换。'};
save('report.json',report);console.log(JSON.stringify(report));
execFileSync(process.execPath,['scripts/prepare-host.mjs',scenario],{stdio:'inherit',windowsHide:true});
