import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {Store} from '../store.js';
import {workInput} from '../schemas.js';

test('独立 MCP 客户端按实际目录读取、保存、读回，并报告旧基线',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'agent-lab-mcp-'));
  const db=resolve(directory,'novel.sqlite');
  const store=new Store(db);
  const seed=workInput.parse(JSON.parse(await readFile('seed/钟楼.json','utf8')));
  store.init(seed);store.close();
  const client=new Client({name:'agent-lab-check',version:'0.1.0'});
  const transport=new StdioClientTransport({command:process.execPath,args:[resolve('dist/mcp.js'),db],stderr:'pipe'});
  try{
    await client.connect(transport);
    const tools=await client.listTools();
    assert.deepEqual(tools.tools.map(tool=>tool.name).sort(),['list_chapters','read_chapter','read_work','save_draft']);
    const initial=await client.callTool({name:'read_work',arguments:{workId:seed.id}});
    assert.equal((initial.structuredContent as {result:{revision:number}}).result.revision,1);
    const args={workId:seed.id,chapterNumber:1,expectedWorkRevision:1,expectedChapterRevision:0,expectedPreviousRevisions:[],title:'MCP 人工验证',body:'通过真实 stdio 服务写入的人工测试文本，不是模型生成。'};
    const saved=await client.callTool({name:'save_draft',arguments:args});
    assert.equal((saved.structuredContent as {result:{revision:number}}).result.revision,1);
    const readBack=await client.callTool({name:'read_chapter',arguments:{workId:seed.id,chapterNumber:1}});
    assert.equal((readBack.structuredContent as {result:{body:string}}).result.body,args.body);
    const stale=await client.callTool({name:'save_draft',arguments:{...args,body:'旧基线不能覆盖。'}});
    assert.equal(stale.isError,true);
    assert.match(JSON.stringify(stale.content),/STALE_CHAPTER/);
    const invalid=await client.callTool({name:'read_chapter',arguments:{workId:seed.id,chapterNumber:0}});
    assert.equal(invalid.isError,true);
  }finally{await client.close();}
});
