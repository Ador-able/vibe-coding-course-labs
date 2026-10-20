import type {Client} from '@modelcontextprotocol/sdk/client/index.js';
import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import type {ThreadItem} from '@openai/codex-sdk';

export type ReadName='read_work'|'read_chapter';
export type ReadResult={tool:ReadName;arguments:Record<string,unknown>;startedMs:number;finishedMs:number;ok:boolean;result?:unknown;error?:unknown;raw?:unknown};
export type ReadCall=(name:ReadName,args:Record<string,unknown>)=>Promise<ReadResult>;
export type Arrangement='serial'|'routed'|'concurrent';
export type Preparation={reads:ReadResult[];route:'existing'|'empty'|'incomplete'|'unavailable';ready:boolean};

// 只认应用实读和 SDK 工具结果，最终回答不能证明资料已经取得。
export function materialEvidence(appReads:ReadResult[],items:ThreadItem[],workId:string){
  const relevant=(tool:string,args:unknown)=>{
    const input=args as {workId?:string;chapterNumber?:number}|null;
    return input?.workId===workId&&(tool==='read_work'||tool==='read_chapter'&&input.chapterNumber===1);
  };
  const reads=appReads.filter(r=>relevant(r.tool,r.arguments)).map(r=>({origin:'application',tool:r.tool,ok:r.ok,result:r.result,error:r.error}));
  for(const item of items){
    if(item.type!=='mcp_tool_call'||item.server!=='novel_lab'||!relevant(item.tool,item.arguments))continue;
    const data=item.result?.structured_content as {result?:unknown}|null|undefined;
    const ok=item.status==='completed'&&Boolean(data&&Object.hasOwn(data,'result'));
    reads.push({origin:'sdk-tool',tool:item.tool as ReadName,ok,result:ok?data!.result:undefined,error:ok?undefined:item.error??item.result??{status:item.status}});
  }
  const work=reads.find(r=>r.tool==='read_work'&&r.ok),chapter=reads.find(r=>r.tool==='read_chapter'&&r.ok);
  const ready=Boolean(work&&chapter);
  return {ready,state:ready?'ready':reads.some(r=>!r.ok)?'unavailable':'incomplete',workRead:Boolean(work),chapterRead:Boolean(chapter),chapterStatus:chapter?(chapter.result===null?'empty':'existing'):'unknown',reads};
}

// 错误与正常的空章稿分开，成功的另一项资料仍保留。
export function prepare(reads:ReadResult[]):Preparation{
  const work=reads.find(r=>r.tool==='read_work');
  const chapter=reads.find(r=>r.tool==='read_chapter');
  const ready=Boolean(work?.ok&&chapter?.ok);
  return {reads,ready,route:ready?(chapter!.result===null?'empty':'existing'):reads.some(r=>!r.ok)?'unavailable':'incomplete'};
}

export async function collect(arrangement:Arrangement,read:ReadCall,workId:string):Promise<Preparation>{
  const workArgs={workId},chapterArgs={workId,chapterNumber:1};
  if(arrangement==='concurrent'){
    // 两项只读查询无输入依赖；同时在途不表示 SQLite 同时执行。
    const results=await Promise.allSettled([read('read_work',workArgs),read('read_chapter',chapterArgs)]);
    return prepare(results.map((r,i)=>r.status==='fulfilled'?r.value:{tool:i===0?'read_work':'read_chapter',arguments:i===0?workArgs:chapterArgs,startedMs:0,finishedMs:0,ok:false,error:String(r.reason)}));
  }
  if(arrangement==='routed'){
    const chapter=await read('read_chapter',chapterArgs);
    if(!chapter.ok)return prepare([chapter]);
    return prepare([chapter,await read('read_work',workArgs)]);
  }
  const work=await read('read_work',workArgs);
  if(!work.ok)return prepare([work]);
  return prepare([work,await read('read_chapter',chapterArgs)]);
}

export function reader(client:Client,onEvent:(event:unknown)=>Promise<void>):ReadCall{
  return async(tool,args)=>{
    const startedMs=performance.now();
    await onEvent({phase:'started',tool,arguments:args,atMs:startedMs});
    try{
      const raw=await client.callTool({name:tool,arguments:args}) as CallToolResult;
      const finishedMs=performance.now();
      const text=raw.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
      const data=raw.structuredContent??JSON.parse(text);
      const result:ReadResult=raw.isError?{tool,arguments:args,startedMs,finishedMs,ok:false,error:data,raw}:{tool,arguments:args,startedMs,finishedMs,ok:true,result:(data as {result:unknown}).result,raw};
      await onEvent({phase:'finished',...result});
      return result;
    }catch(error){
      const result:ReadResult={tool,arguments:args,startedMs,finishedMs:performance.now(),ok:false,error:error instanceof Error?error.message:String(error)};
      await onEvent({phase:'finished',...result});return result;
    }
  };
}
