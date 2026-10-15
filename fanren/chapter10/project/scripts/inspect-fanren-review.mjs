import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {parseArgs,isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {Store} from '../dist/store.js';
import {currentPractice,snapshotDatabase} from './practice-state.mjs';

const {values}=parseArgs({options:{output:{type:'string',default:'materials/178-凡人只读审阅/当前产物程序核对.json'}}}),practice=currentPractice(),database=resolve(practice.database),before=snapshotDatabase(database),store=new Store(database),sha=value=>createHash('sha256').update(value).digest('hex');
let report;
try{
  const work=store.getWork(practice.workId),chapters=store.listChapters(work.id).map(c=>store.getChapter(work.id,c.number)),manifest=JSON.parse(readFileSync('materials/凡人原文/原文来源.json','utf8')),exported=store.exportWork(work.id);
  // 原文边界沿来源清单：教学标题与空行不入正文，仅移除末尾文件换行。
  const originals=manifest.items.map(item=>{const bytes=readFileSync(item.path),text=bytes.toString('utf8').replace(/\r\n/gu,'\n'),body=text.slice(text.indexOf('\n\n')+2).replace(/\n$/u,'');return {...item,fileBytesMatch:sha(bytes)===item.sha256,bodyBoundaryMatches:sha(body)===item.bodySha256,body};});
  const metrics=body=>({hanCharacters:(body.match(/\p{Script=Han}/gu)??[]).length,utf16Length:body.length,codePoints:[...body].length,utf8Bytes:Buffer.byteLength(body),sha256:sha(body)});
  const difference=(left,right)=>left.length===right.length?{equalUtf16Length:true,changes:[...left].flatMap((c,index)=>c===[...right][index]?[]:[{codePointIndex:index,before:c,after:[...right][index]}])}:{equalUtf16Length:false,before:metrics(left),after:metrics(right)};
  report={database,workId:work.id,workRevision:work.revision,scope:'程序只核当前对象、字符和字节，不判断情节、表达或采用；完整原作仍署忘语。',counting:'chapters与histories按正文统计：Han列不含标题、标点、空格和换行；export按完整Markdown统计，含标题、用途和状态文字。UTF-16、码点、UTF-8字节另列，均不是token。',chapters:chapters.map((chapter,index)=>({number:chapter.number,title:chapter.title,revision:chapter.revision,origin:chapter.origin,status:chapter.status,workRevision:chapter.workRevision,previousRevisions:chapter.previousRevisions,reviewNote:chapter.reviewNote,...metrics(chapter.body),source:originals[index].path,originalFileMatches:originals[index].fileBytesMatch,originalBodyBoundaryMatches:originals[index].bodyBoundaryMatches,sourceDifference:difference(originals[index].body,chapter.body)})),histories:before.chapter_versions.map(row=>{const chapter=JSON.parse(row.content);return {number:chapter.number,revision:chapter.revision,origin:chapter.origin,status:chapter.status,...metrics(chapter.body)};}),export:{...exported,text:undefined,...metrics(exported.text)},existingTaskCount:before.tasks.length};
}finally{store.close();}
report.fiveBusinessTablesUnchanged=isDeepStrictEqual(before,snapshotDatabase(database));
mkdirSync(dirname(values.output),{recursive:true});writeFileSync(values.output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({path:resolve(values.output),workRevision:report.workRevision,chapters:report.chapters.map(c=>({number:c.number,revision:c.revision,status:c.status})),fiveBusinessTablesUnchanged:report.fiveBusinessTablesUnchanged}));
