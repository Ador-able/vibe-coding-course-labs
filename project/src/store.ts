import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {LabError,type WorkInput,type DraftInput} from './schemas.js';

export type Work=WorkInput & {revision:number};
export type Chapter={workId:string;number:number;revision:number;title:string;body:string;status:'draft'|'adopted';workRevision:number;origin:'human'|'agent';taskId:string|null;threadId:string|null;updatedAt:string};
export type Task={id:string;workId:string;chapterNumber:number;threadId:string|null;state:'created'|'running'|'completed'|'failed'|'cancelled'|'interrupted';codeVersion:string;createdAt:string;updatedAt:string;error:string|null;usage:unknown};

export class Store {
  readonly db:DatabaseSync;
  constructor(path:string){
    if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
    this.db=new DatabaseSync(path,{timeout:2000});
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS works(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, content TEXT NOT NULL) STRICT;
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
    this.db.prepare('INSERT INTO works VALUES(?,?,?)').run(input.id,1,JSON.stringify(input));
    return {...input,revision:1};
  }
  getWork(id:string):Work{
    const row=this.db.prepare('SELECT revision,content FROM works WHERE id=?').get(id);
    if(!row)throw new LabError('WORK_NOT_FOUND',`没有作品 ${id}，先初始化。`);
    return {...JSON.parse(row.content as string),revision:Number(row.revision)};
  }
  getChapter(workId:string,number:number):Chapter|null{
    this.getWork(workId);
    const row=this.db.prepare('SELECT content FROM chapters WHERE work_id=? AND number=?').get(workId,number);
    return row?JSON.parse(row.content as string):null;
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
      const current=this.getChapter(work.id,input.chapterNumber);
      if((current?.revision??0)!==input.expectedChapterRevision)throw new LabError('STALE_CHAPTER',`正文已是 r${current?.revision??0}，请重读后合并。`);
      const task=taskId?this.getTask(taskId):null;
      if(task&&(task.workId!==work.id||task.chapterNumber!==input.chapterNumber))throw new LabError('TASK_MISMATCH','任务与本章不一致。');
      const chapter:Chapter={workId:work.id,number:input.chapterNumber,revision:(current?.revision??0)+1,title:input.title,body:input.body,status:'draft',workRevision:work.revision,origin,taskId,threadId:task?.threadId??null,updatedAt:new Date().toISOString()};
      const content=JSON.stringify(chapter);
      this.db.prepare('INSERT INTO chapters VALUES(?,?,?,?) ON CONFLICT(work_id,number) DO UPDATE SET revision=excluded.revision,content=excluded.content').run(work.id,chapter.number,chapter.revision,content);
      this.db.prepare('INSERT INTO chapter_versions VALUES(?,?,?,?)').run(work.id,chapter.number,chapter.revision,content);
      return chapter;
    });
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
