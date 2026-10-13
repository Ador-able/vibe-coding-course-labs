import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

export const tables=['works','work_versions','chapters','chapter_versions','tasks'];
export function currentPractice(){return JSON.parse(readFileSync(resolve('practice.json'),'utf8'));}
export function snapshotDatabase(database){
  const db=new DatabaseSync(resolve(database),{readOnly:true});
  try{return Object.fromEntries(tables.map(table=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()]));}
  finally{db.close();}
}
