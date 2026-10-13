import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {Store} from './store.js';
import {draftInput,workId,LabError} from './schemas.js';

const assets=new Map([['/','index.html'],['/app.js','app.js'],['/app.css','app.css']]);
const mime=new Map([['index.html','text/html'],['app.js','text/javascript'],['app.css','text/css']]);
function json(response:ServerResponse,status:number,value:unknown){response.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});response.end(JSON.stringify(value));}
async function input(request:IncomingMessage){const chunks:Buffer[]=[];for await(const chunk of request)chunks.push(Buffer.from(chunk));try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new LabError('INVALID_JSON','请求正文不是有效 JSON。');}}

// HTTP、CLI 与 MCP 使用同一个 Store，页面只保存尚未提交的编辑缓冲。
export function prototypeServer(store:Store,defaultWorkId:string){
  return createServer(async(request,response)=>{
    try{
      const url=new URL(request.url??'/', 'http://127.0.0.1');
      if(request.method==='GET'&&url.pathname==='/api/config'){json(response,200,{workId:defaultWorkId});return;}
      if(request.method==='GET'&&url.pathname==='/api/work'){
        const id=workId.parse(url.searchParams.get('work'));const work=store.getWork(id);
        const summary=store.exportWork(id);const chapters=store.listChapters(id).map(c=>({...store.getChapter(id,c.number)!,basisCurrent:summary.chapters.find(s=>s.number===c.number)!.basisCurrent}));
        json(response,200,{work,chapters});return;
      }
      if(request.method==='POST'&&url.pathname==='/api/draft'){
        const submitted=draftInput.parse(await input(request));const saved=store.saveDraft(submitted,'human');json(response,200,saved);return;
      }
      const asset=assets.get(url.pathname);
      if(request.method==='GET'&&asset){const bytes=await readFile(new URL('../prototype/'+asset,import.meta.url));response.writeHead(200,{'content-type':mime.get(asset)+'; charset=utf-8','cache-control':'no-store'});response.end(bytes);return;}
      json(response,404,{error:{code:'NOT_FOUND',message:'没有这个入口。'}});
    }catch(error){
      if(error instanceof z.ZodError){json(response,400,{error:{code:'INVALID_INPUT',message:'请填写完整标题、正文和有效的保存依据。'}});return;}
      if(error instanceof LabError){const status=error.code.endsWith('NOT_FOUND')?404:error.code.startsWith('STALE_')?409:400;json(response,status,{error:{code:error.code,message:error.message}});return;}
      console.error(error);json(response,500,{error:{code:'INTERNAL_ERROR',message:'本次请求未确认。请先重新读取当前稿，核对后继续。'}});
    }
  });
}
