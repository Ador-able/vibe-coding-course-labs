import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve,sep,extname} from 'node:path';
import {parseArgs} from 'node:util';

const {values}=parseArgs({options:{port:{type:'string',default:'4364'}}}),root=resolve('.');
const contentTypes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8','.png':'image/png'};
const server=createServer((request,response)=>{
  if(request.method!=='GET'){response.writeHead(405);response.end();return;}
  const url=new URL(request.url,'http://localhost'),pathname=decodeURIComponent(url.pathname),path=pathname==='/'?'materials/viewer.html':pathname.slice(1);
  if(!/^(materials|inputs|records)\//.test(path)){response.writeHead(404);response.end();return;}
  const file=resolve(root,path);
  if(!file.startsWith(root+sep)){response.writeHead(404);response.end();return;}
  try{const bytes=readFileSync(file);response.writeHead(200,{'content-type':contentTypes[extname(file)]??'text/plain; charset=utf-8','cache-control':'no-store'});response.end(bytes);}catch{response.writeHead(404);response.end('没有这个公开材料。');}
});
server.listen(Number(values.port),'127.0.0.1',()=>console.log(`课堂实录：http://127.0.0.1:${values.port}（只读，0模型）`));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());
