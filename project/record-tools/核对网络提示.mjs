import {chromium,expect} from './lab/node_modules/@playwright/test/index.mjs';
import {Store} from './lab/dist/store.js';
import {prototypeServer} from './lab/dist/prototype-http.js';
import {seedPrototype} from './lab/scripts/prototype-seed.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

// 只验证实际网络失败提示及原有编辑行为，不重跑已通过的三方案。
const root=fileURLToPath(new URL('.',import.meta.url)),runId=randomUUID();
const dir=resolve(root,'实际证据','网络提示-'+runId);await mkdir(dir,{recursive:true});
const initial=await seedPrototype(resolve(dir,'fixture.sqlite'));
const store=new Store(resolve(dir,'fixture.sqlite')),server=prototypeServer(store,initial.work.id);
server.listen(0,'127.0.0.1');await once(server,'listening');
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1200},locale:'zh-CN',colorScheme:'light'});
const page=await context.newPage(),events=[],pending=[];
page.on('requestfailed',r=>events.push({method:r.method(),path:new URL(r.url()).pathname,input:r.postData()?JSON.parse(r.postData()):null,failure:r.failure()}));
page.on('response',r=>{if(!new URL(r.url()).pathname.startsWith('/api/'))return;pending.push((async()=>events.push({method:r.request().method(),path:new URL(r.url()).pathname,status:r.status(),input:r.request().postData()?JSON.parse(r.request().postData()):null,output:await r.json()}))());});
try{
  await page.goto('http://127.0.0.1:'+server.address().port+'/?variant=original');
  await expect(page.locator('#draft-body')).toHaveValue(initial.chapters[1].body);
  const body=initial.chapters[1].body+'\n\n尚未确认的本地修改：林澈收起了铅笔。';
  await page.locator('#draft-body').fill(body);await context.setOffline(true);
  await page.getByRole('button',{name:'保存草稿',exact:true}).click();
  const expected='无法连接服务，本次请求结果未确认。 本地修改仍保留。恢复连接后先读取当前稿。（NETWORK_UNCONFIRMED）';
  await expect(page.locator('#message')).toHaveText(expected);
  await expect(page.locator('#draft-title')).toBeEnabled();await expect(page.locator('#draft-body')).toBeEnabled();
  await expect(page.getByRole('button',{name:'保存草稿',exact:true})).toBeDisabled();
  await page.locator('#draft-body').focus();await page.locator('#draft-body').press('Control+End');await page.keyboard.type('失败后可以继续编辑。');
  const continued=body+'失败后可以继续编辑。';await expect(page.locator('#draft-body')).toHaveValue(continued);
  await page.screenshot({path:resolve(dir,'网络失败-完整页面.png'),fullPage:true});
  const failure={message:await page.locator('#message').textContent(),titleEditable:await page.locator('#draft-title').isEditable(),bodyEditable:await page.locator('#draft-body').isEditable(),saveDisabled:await page.locator('#save').isDisabled(),body:await page.locator('#draft-body').inputValue(),currentStored:store.getChapter(initial.work.id,2)};
  await context.setOffline(false);await page.getByRole('button',{name:'读取当前稿',exact:true}).click();
  await expect(page.locator('#remote-body')).toHaveValue(initial.chapters[1].body);await expect(page.locator('#draft-body')).toHaveValue(continued);
  await page.screenshot({path:resolve(dir,'恢复重读-完整页面.png'),fullPage:true});
  await Promise.all(pending);
  const result={runId,codeVersion:execFileSync('git',['rev-parse','HEAD'],{cwd:resolve(root,'lab'),encoding:'utf8'}).trim(),gitStatus:execFileSync('git',['status','--porcelain'],{cwd:resolve(root,'lab'),encoding:'utf8'}).trim(),appDigest:createHash('sha256').update(await readFile(resolve(root,'lab','prototype','app.js'))).digest('hex'),workId:initial.work.id,scope:'实际 Edge、真实本地 HTTP，整上下文断网造成 POST 失败；人工初始化新库，无模型调用。只验证精确文案及网络失败后原有恢复行为。',initial,failure,recovery:{localBody:await page.locator('#draft-body').inputValue(),remoteBody:await page.locator('#remote-body').inputValue(),remoteHeading:await page.locator('#remote-heading').textContent(),currentStored:store.getChapter(initial.work.id,2)},events,passed:true};
  await writeFile(resolve(dir,'完整输入输出.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({runId,dir,codeVersion:result.codeVersion,workId:initial.work.id,passed:true}));
}catch(error){await writeFile(resolve(dir,'FAILED.txt'),error.stack);throw error;}
finally{await context.close();await browser.close();await new Promise((r,j)=>server.close(e=>e?j(e):r()));store.close();}
