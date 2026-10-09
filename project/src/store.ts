import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import assert from 'node:assert/strict';
import {LabError,type WorkInput,type DraftInput} from './schemas.js';

export type Work=WorkInput & {revision:number};
export type Chapter={workId:string;number:number;revision:number;title:string;body:string;status:'draft'|'adopted';workRevision:number;origin:'human'|'agent';taskId:string|null;threadId:string|null;updatedAt:string;previousRevisions?:{number:number;revision:number}[];reviewNote?:string|null};
export type Task={id:string;workId:string;chapterNumber:number;threadId:string|null;state:'created'|'running'|'completed'|'failed'|'cancelled'|'interrupted';codeVersion:string;createdAt:string;updatedAt:string;error:string|null;usage:unknown};

export class Store {
  readonly db:DatabaseSync;
  constructor(path:string){
    if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
    this.db=new DatabaseSync(path,{timeout:2000});
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS works(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, content TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS work_versions(work_id TEXT NOT NULL REFERENCES works(id), revision INTEGER NOT NULL, content TEXT NOT NULL, PRIMARY KEY(work_id,revision)) STRICT;
      CREATE TABLE IF NOT EXISTS chapters(work_id TEXT NOT NULL REFERENCES works(id), number INTEGER NOT NULL, revision INTEGER NOT NULL, content TEXT NOT NULL, PRIMARY KEY(work_id,number)) STRICT;
      CREATE TABLE IF NOT EXISTS chapter_versions(work_id TEXT NOT NULL, number INTEGER NOT NULL, revision INTEGER NOT NULL, content TEXT NOT NULL, PRIMARY KEY(work_id,number,revision), FOREIGN KEY(work_id,number) REFERENCES chapters(work_id,number)) STRICT;
      CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, content TEXT NOT NULL) STRICT;
    `);
  }
  close(){this.db.close();}
  private transaction<T>(action:()=>T):T{
    // 读取基线与写入处于同一事务，两个入口不能越过修订检查。
    this.db.exec('BEGIN IMMEDIATE');
    try{const result=action();this.db.exec('COMMIT');return result;}
    catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  init(input:WorkInput):Work{
    if(this.db.prepare('SELECT id FROM works WHERE id=?').get(input.id))throw new LabError('WORK_EXISTS','作品已存在，初始化不会覆盖它。');
    if(input.outline.some((item,index)=>item.number!==index+1))throw new LabError('OUTLINE_ORDER','大纲章节必须从 1 开始连续排列。');
    return this.transaction(()=>{
      const content=JSON.stringify(input);
      this.db.prepare('INSERT INTO works VALUES(?,?,?)').run(input.id,1,content);
      this.db.prepare('INSERT INTO work_versions VALUES(?,?,?)').run(input.id,1,content);
      return {...input,revision:1};
    });
  }
  getWork(id:string):Work{
    const row=this.db.prepare('SELECT revision,content FROM works WHERE id=?').get(id);
    if(!row)throw new LabError('WORK_NOT_FOUND',`没有作品 ${id}，先初始化。`);
    return {...JSON.parse(row.content as string),revision:Number(row.revision)};
  }
  listWorks():Work[]{
    return this.db.prepare('SELECT revision,content FROM works ORDER BY id').all().map(row=>({...JSON.parse(row.content as string),revision:Number(row.revision)}));
  }
  getChapter(workId:string,number:number):Chapter|null{
    this.getWork(workId);
    return this.findChapter(workId,number);
  }
  private findChapter(workId:string,number:number):Chapter|null{
    const row=this.db.prepare('SELECT content FROM chapters WHERE work_id=? AND number=?').get(workId,number);
    return row?JSON.parse(row.content as string):null;
  }
  updateWork(input:WorkInput,expectedRevision:number):Work{
    return this.transaction(()=>{
      const current=this.getWork(input.id);
      if(current.revision!==expectedRevision)throw new LabError('STALE_WORK',`要求已是 r${current.revision}，请重读后再修改。`);
      if(input.outline.some((item,index)=>item.number!==index+1))throw new LabError('OUTLINE_ORDER','大纲章节必须从 1 开始连续排列。');
      const saved=this.db.prepare('SELECT number FROM chapters WHERE work_id=?').all(current.id);
      if(saved.some(row=>!input.outline.some(item=>item.number===row.number)))throw new LabError('OUTLINE_HAS_SAVED_CHAPTER','大纲不能静默移除已保存的章节。');
      const revision=current.revision+1;
      // 改写前保存当前原始资料，修订引用有实际文本可回查。
      this.db.prepare('INSERT INTO work_versions SELECT id,revision,content FROM works WHERE id=? ON CONFLICT(work_id,revision) DO NOTHING').run(current.id);
      const content=JSON.stringify(input);
      this.db.prepare('UPDATE works SET revision=?,content=? WHERE id=?').run(revision,content,current.id);
      this.db.prepare('INSERT INTO work_versions VALUES(?,?,?)').run(current.id,revision,content);
      return {...input,revision};
    });
  }
  getWorkVersion(id:string,revision:number):Work{
    this.getWork(id);
    const row=this.db.prepare('SELECT content FROM work_versions WHERE work_id=? AND revision=?').get(id,revision);
    if(!row)throw new LabError('WORK_VERSION_NOT_FOUND','没有保存这个资料修订。');
    return {...JSON.parse(row.content as string),revision};
  }
  private persistChapter(chapter:Chapter):Chapter{
    const content=JSON.stringify(chapter);
    this.db.prepare('INSERT INTO chapters VALUES(?,?,?,?) ON CONFLICT(work_id,number) DO UPDATE SET revision=excluded.revision,content=excluded.content').run(chapter.workId,chapter.number,chapter.revision,content);
    this.db.prepare('INSERT INTO chapter_versions VALUES(?,?,?,?)').run(chapter.workId,chapter.number,chapter.revision,content);
    return chapter;
  }
  listChapters(workId:string):Omit<Chapter,'body'>[]{
    this.getWork(workId);
    const rows=this.db.prepare('SELECT content FROM chapters WHERE work_id=? ORDER BY number').all(workId);
    return rows.map(row=>{const {body,...chapter}=JSON.parse(row.content as string) as Chapter;return chapter;});
  }
  saveDraft(input:DraftInput,origin:'human'|'agent',taskId:string|null=null):Chapter{
    return this.transaction(()=>{
      const work=this.getWork(input.workId);
      if(work.revision!==input.expectedWorkRevision)throw new LabError('STALE_WORK',`要求已是 r${work.revision}，请重读后再保存。`);
      if(!work.outline.some(item=>item.number===input.chapterNumber))throw new LabError('CHAPTER_OUT_OF_SCOPE','本章不在当前已确认的大纲中。');
      const current=this.findChapter(work.id,input.chapterNumber);
      if((current?.revision??0)!==input.expectedChapterRevision)throw new LabError('STALE_CHAPTER',`正文已是 r${current?.revision??0}，请重读后合并。`);
      const bases=[...input.expectedPreviousRevisions].sort((a,b)=>a.number-b.number);
      if(bases.length!==input.chapterNumber-1||bases.some((item,index)=>item.number!==index+1))throw new LabError('PREVIOUS_BASES_REQUIRED','需要逐项提供前面全部章节的当前修订。');
      for(const base of bases){
        const previous=this.findChapter(work.id,base.number);
        if(!previous)throw new LabError('PREVIOUS_CHAPTER_MISSING',`第 ${base.number} 章尚未保存。`);
        if(previous.revision!==base.revision)throw new LabError('STALE_PREVIOUS',`第 ${base.number} 章已经是 r${previous.revision}，请读取当前正文后再续写。`);
      }
      const task=taskId?this.getTask(taskId):null;
      if(task&&(task.workId!==work.id||task.chapterNumber!==input.chapterNumber))throw new LabError('TASK_MISMATCH','任务与本章不一致。');
      const chapter:Chapter={workId:work.id,number:input.chapterNumber,revision:(current?.revision??0)+1,title:input.title,body:input.body,status:'draft',workRevision:work.revision,origin,taskId,threadId:task?.threadId??null,updatedAt:new Date().toISOString(),previousRevisions:bases,reviewNote:null};
      return this.persistChapter(chapter);
    });
  }
  adopt(workId:string,number:number,expectedRevision:number,note:string):Chapter{
    return this.transaction(()=>{
      const work=this.getWork(workId);
      const current=this.findChapter(work.id,number);
      if(!current)throw new LabError('CHAPTER_NOT_FOUND','还没有该章正文。');
      if(current.revision!==expectedRevision)throw new LabError('STALE_CHAPTER',`正文已是 r${current.revision}，不能采用旧版本。`);
      return this.persistChapter({...current,revision:current.revision+1,status:'adopted',origin:'human',reviewNote:note,updatedAt:new Date().toISOString()});
    });
  }
  exportWork(id:string){
    const work=this.getWork(id);
    const rows=this.db.prepare('SELECT content FROM chapters WHERE work_id=? ORDER BY number').all(id);
    const chapters=rows.map(row=>JSON.parse(row.content as string) as Chapter);
    const details=chapters.map(chapter=>{
      if(chapter.number>1)assert(chapter.previousRevisions,'连续章节缺少保存时的前文基线');
      const previousChanged=(chapter.previousRevisions??[]).some(base=>this.findChapter(id,base.number)?.revision!==base.revision);
      return {number:chapter.number,revision:chapter.revision,status:chapter.status,workRevision:chapter.workRevision,previousRevisions:chapter.previousRevisions??[],reviewNote:chapter.reviewNote??null,basisCurrent:chapter.workRevision===work.revision&&!previousChanged};
    });
    const text=`# ${work.title}\n\n用途：${work.purpose}\n\n`+chapters.map((chapter,index)=>`## 第 ${chapter.number} 章 ${chapter.title}\n\n状态：${chapter.status}，正文 r${chapter.revision}；${details[index].basisCurrent?'资料基线一致，品质仍需人判断':'资料有变动，需重新核对'}。\n\n${chapter.reviewNote?`采用说明：${chapter.reviewNote}\n\n`:''}${chapter.body}\n`).join('\n');
    return {workId:id,workRevision:work.revision,expectedChapters:work.outline.length,savedChapters:chapters.length,allOutlineChaptersSaved:chapters.length===work.outline.length&&chapters.every((chapter,index)=>chapter.number===index+1),chapters:details,text};
  }
  createTask(input:Pick<Task,'id'|'workId'|'chapterNumber'|'codeVersion'>):Task{
    const work=this.getWork(input.workId);
    if(!work.outline.some(item=>item.number===input.chapterNumber))throw new LabError('CHAPTER_OUT_OF_SCOPE','任务章节不在大纲中。');
    const now=new Date().toISOString();
    const task:Task={...input,threadId:null,state:'created',createdAt:now,updatedAt:now,error:null,usage:null};
    this.db.prepare('INSERT INTO tasks VALUES(?,?)').run(task.id,JSON.stringify(task));return task;
  }
  getTask(id:string):Task{
    const row=this.db.prepare('SELECT content FROM tasks WHERE id=?').get(id);
    if(!row)throw new LabError('TASK_NOT_FOUND','任务记录不存在。');return JSON.parse(row.content as string);
  }
  updateTask(id:string,change:Partial<Pick<Task,'threadId'|'state'|'error'|'usage'>>):Task{
    const task={...this.getTask(id),...change,updatedAt:new Date().toISOString()};
    this.db.prepare('UPDATE tasks SET content=? WHERE id=?').run(JSON.stringify(task),id);return task;
  }
}
