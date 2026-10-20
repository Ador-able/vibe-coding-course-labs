import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {Store} from '../store.js';
import {workInput} from '../schemas.js';
import {collect,reader,materialEvidence,type ReadResult} from '../control-order.js';
import type {ThreadItem} from '@openai/codex-sdk';

test('模型完成宣言与目录不能代替全文读取，失败仍为未知而非空稿',()=>{
  const work:ReadResult={tool:'read_work',arguments:{workId:'fanren'},startedMs:0,finishedMs:1,ok:true,result:{facts:['已读作品']}};
  const words:ThreadItem={id:'message',type:'agent_message',text:'核对完成，没有章稿。'};
  assert.equal(materialEvidence([work],[words],'fanren').ready,false);
  assert.equal(materialEvidence([work],[words],'fanren').chapterStatus,'unknown');
  const directory:ThreadItem={id:'list',type:'mcp_tool_call',server:'novel_lab',tool:'list_chapters',arguments:{workId:'fanren'},status:'completed',result:{content:[],structured_content:{result:{chapters:[]}}}};
  assert.equal(materialEvidence([work],[directory],'fanren').ready,false);
  const failed:ThreadItem={id:'chapter',type:'mcp_tool_call',server:'novel_lab',tool:'read_chapter',arguments:{workId:'fanren',chapterNumber:1},status:'failed',result:{content:[{type:'text',text:'读取失败'}],structured_content:null}};
  assert.equal(materialEvidence([work],[failed],'fanren').state,'unavailable');
  assert.equal(materialEvidence([work],[failed],'fanren').chapterStatus,'unknown');
  const empty:ThreadItem={...failed,status:'completed',result:{content:[],structured_content:{result:null}}};
  assert.equal(materialEvidence([work],[empty],'fanren').ready,true);
  assert.equal(materialEvidence([work],[empty],'fanren').chapterStatus,'empty');
  assert.equal(materialEvidence([work],[{...empty,arguments:{workId:'fanren',chapterNumber:2}}],'fanren').ready,false);
});

test('实际 MCP 路由区分空稿与作品读取失败，并行保留每项错误',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'control-lab-')),db=resolve(directory,'novel.sqlite');
  const store=new Store(db);store.init(workInput.parse(JSON.parse(await readFile('seed/凡人修仙传.json','utf8'))));store.close();
  const client=new Client({name:'control-route-check',version:'1.0.0'});
  try{
    await client.connect(new StdioClientTransport({command:process.execPath,args:[resolve('dist/mcp.js'),db],stderr:'pipe'}));
    const read=reader(client,async()=>{});
    const empty=await collect('routed',read,'fanren');
    assert.equal(empty.route,'empty');assert.equal(empty.ready,true);assert.equal(empty.reads[0].result,null);
    const failed=await collect('routed',read,'absent-work');
    assert.equal(failed.route,'unavailable');assert.equal(failed.ready,false);assert.equal(failed.reads.length,1);
    assert.match(JSON.stringify(failed.reads[0].error),/WORK_NOT_FOUND/);
    const both=await collect('concurrent',read,'absent-work');
    assert.equal(both.reads.length,2);assert.ok(both.reads.every(r=>!r.ok));
  }finally{await client.close();}
});

test('独立读取均启动后才等待，单项失败不丢弃成功全文',async()=>{
  const pending:((r:ReadResult)=>void)[]=[],started:string[]=[];
  const result=collect('concurrent',async(tool,args)=>{
    started.push(tool);return new Promise<ReadResult>(resolve=>pending.push(resolve));
  },'fanren');
  assert.deepEqual(started,['read_work','read_chapter']);
  pending[1]({tool:'read_chapter',arguments:{},startedMs:0,finishedMs:1,ok:false,error:'真实失败'});
  pending[0]({tool:'read_work',arguments:{},startedMs:0,finishedMs:2,ok:true,result:{facts:['全文仍保留']}});
  const prepared=await result;
  assert.equal(prepared.ready,false);assert.deepEqual(prepared.reads[0].result,{facts:['全文仍保留']});
  assert.equal(prepared.reads[1].error,'真实失败');
});
