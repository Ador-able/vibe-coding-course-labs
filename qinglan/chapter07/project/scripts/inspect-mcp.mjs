import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {workId,chapterNumber} from '../dist/schemas.js';

const {values}=parseArgs({options:{db:{type:'string',default:'data/novel.sqlite'},work:{type:'string',default:'qinglan'},chapter:{type:'string',default:'1'},output:{type:'string'}}});
const id=workId.parse(values.work),number=chapterNumber.parse(Number(values.chapter));
const client=new Client({name:'novel-lab-catalog-check',version:'0.1.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[resolve('dist/mcp.js'),resolve(values.db)],stderr:'pipe'});
try{
  await client.connect(transport);
  const tools=await client.listTools();
  const resources=await client.listResources();
  const templates=await client.listResourceTemplates();
  const prompts=await client.listPrompts();
  const work=await client.readResource({uri:`novel://works/${id}/requirements`});
  const chapter=await client.readResource({uri:`novel://works/${id}/chapters/${number}`});
  const prompt=await client.getPrompt({name:'review_chapter',arguments:{workId:id,chapterNumber:String(number)}});
  const result={capabilities:client.getServerCapabilities(),tools,resources,templates,prompts,work,chapter,prompt,limits:'实际客户端取得目录和内容；不证明任何宿主会自动注入资源或自动运行提示。'};
  if(values.output)await writeFile(values.output,JSON.stringify(result,null,2),'utf8');
  console.log(JSON.stringify({tools:tools.tools.map(tool=>tool.name),resourceCount:resources.resources.length,templates:templates.resourceTemplates.map(template=>template.uriTemplate),prompts:prompts.prompts.map(prompt=>prompt.name),workRevision:JSON.parse(work.contents[0].text).revision,chapterRevision:JSON.parse(chapter.contents[0].text).revision,promptMessages:prompt.messages.length,output:values.output??null}));
}finally{await client.close();}
