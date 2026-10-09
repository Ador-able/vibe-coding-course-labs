import {chromium,expect} from '@playwright/test';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {Store} from '../dist/store.js';
import {prototypeServer} from '../dist/prototype-http.js';
import {seedPrototype} from './prototype-seed.mjs';

const {values}=parseArgs({options:{variants:{type:'string',default:'original,desk,notes'}}});
const runId=randomUUID(),dir=resolve('runs','prototype-ui-'+runId);await mkdir(dir,{recursive:true});
const codeVersion=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const dirty=execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim();
const metadata={runId,codeVersion,dirty:!!dirty,gitStatus:dirty,node:process.version,viewport:{width:1440,height:1200},mobileViewport:{width:390,height:844},browser:'实际本机 Edge，Playwright 1.63.0，隔离无登录上下文',mode:'真实本地 HTTP 与共享 Store；正文由既有归档人工初始化；没有模型调用',variants:[]};
await writeFile(resolve(dir,'run-input.json'),JSON.stringify(metadata,null,2));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  for(const variant of values.variants.split(',')){
    const target=resolve(dir,variant);await mkdir(target,{recursive:true});await mkdir(resolve(target,'frames'),{recursive:true});
    const db=resolve(target,'prototype-fixture.sqlite'),initial=await seedPrototype(db);
    await writeFile(resolve(target,'fixture-initial.json'),JSON.stringify(initial,null,2));
    const store=new Store(db),server=prototypeServer(store,initial.work.id);server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
    const context=await browser.newContext({viewport:metadata.viewport,locale:'zh-CN',colorScheme:'light'});
    const page=await context.newPage(),old=await context.newPage();const calls=[],pending=[],pageErrors=[];
    for(const p of [page,old]){p.on('pageerror',e=>pageErrors.push(e.message));p.on('response',response=>{if(!new URL(response.url()).pathname.startsWith('/api/'))return;pending.push((async()=>{const request=response.request();calls.push({page:p===page?'main':'old-window',method:request.method(),path:new URL(response.url()).pathname,request:request.postData()?JSON.parse(request.postData()):null,status:response.status(),response:await response.json()});})());});p.on('requestfailed',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))calls.push({page:p===page?'main':'old-window',method:r.method(),path:new URL(r.url()).pathname,request:r.postData()?JSON.parse(r.postData()):null,networkFailure:r.failure()});});}
    const screenshots=[];const shot=async(p,name,frame=false)=>{await p.screenshot({path:resolve(target,name+'-full.png'),fullPage:true});screenshots.push(name+'-full.png');if(frame)await p.screenshot({path:resolve(target,'frames',name+'.png'),fullPage:false});};
    try{
      const url=base+'/?variant='+variant;await page.goto(url);await old.goto(url);
      if(variant!=='original'){await page.getByRole('button',{name:variant==='desk'?'台面':'笔记页',exact:true}).click();await old.getByRole('button',{name:variant==='desk'?'台面':'笔记页',exact:true}).click();}
      await expect(page.locator('#draft-body')).toHaveValue(initial.chapters[1].body);await expect(old.locator('#draft-body')).toHaveValue(initial.chapters[1].body);
      await expect(page.locator('#revision')).toHaveText('读取 r1 · 草稿 · 依据当前');await shot(page,'00-current',true);
      await page.setViewportSize(metadata.mobileViewport);await shot(page,'mobile-current');if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error(variant+' 窄屏水平溢出');await page.setViewportSize(metadata.viewport);
      await page.getByText('作品资料',{exact:true}).click();await expect(page.locator('#work-context')).toBeVisible();await shot(page,'context-open');await page.getByText('作品资料',{exact:true}).click();
      const body=initial.chapters[1].body+'\n\n林澈把两次听见的间隔记在笔记边上，没有急着替墙后的声音下结论。';
      await page.locator('#draft-body').fill(body);await page.locator('#draft-body').press('Control+End');await expect(page.locator('#edit-state')).toHaveText('有未保存修改');await shot(page,'01-edit',true);
      const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:2500,downloadThroughput:-1,uploadThroughput:-1});
      await page.getByRole('button',{name:'保存草稿',exact:true}).click();await expect(page.locator('#message')).toHaveText('正在保存草稿。');await expect(page.locator('#draft-title')).toBeDisabled();await expect(page.locator('#draft-body')).toBeDisabled();
      await page.keyboard.type('等待期间不应进入正文的文字。');await expect(page.locator('#draft-body')).toHaveValue(body);await expect(page.locator('#draft-title')).toHaveValue(initial.chapters[1].title);await shot(page,'02-waiting');
      await writeFile(resolve(target,'waiting-state.json'),JSON.stringify({conditions:{scope:'只有本标签，真实 HTTP 不替换返回',latencyMilliseconds:2500},message:await page.locator('#message').textContent(),bodyDisabled:await page.locator('#draft-body').isDisabled(),titleDisabled:await page.locator('#draft-title').isDisabled(),bodyEditable:await page.locator('#draft-body').isEditable(),titleEditable:await page.locator('#draft-title').isEditable(),title:await page.locator('#draft-title').inputValue(),body:await page.locator('#draft-body').inputValue(),keyboardAttempt:'等待期间不应进入正文的文字。'},null,2));
      await expect(page.locator('#message')).toHaveText('已保存草稿 r2，并读回当前正文。',{timeout:15000});await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await cdp.detach();await expect(page.locator('#draft-title')).toBeEnabled();await expect(page.locator('#draft-body')).toBeEnabled();await expect(page.locator('#draft-body')).toHaveValue(body);await shot(page,'02-saved',true);
      const staleBody=initial.chapters[1].body+'\n\n旧窗口补记：周伯准备把灯移到洞口旁。';await old.locator('#draft-body').fill(staleBody);await old.locator('#draft-body').press('Control+End');await old.getByRole('button',{name:'保存草稿',exact:true}).click();await expect(old.locator('#message')).toContainText('STALE_CHAPTER');await expect(old.locator('#draft-body')).toHaveValue(staleBody);await shot(old,'03-conflict',true);
      await old.getByRole('button',{name:'读取当前稿',exact:true}).click();await expect(old.locator('#remote-heading')).toHaveText('当前已保存稿 · r2');await expect(old.locator('#remote-body')).toHaveValue(body);await expect(old.locator('#draft-body')).toHaveValue(staleBody);await old.locator('#remote-body').focus();await old.locator('#remote-body').press('Control+End');await shot(old,'04-compare',true);
      const offlineBody=body+'\n\n尚未确认的本地修改：林澈收起了铅笔。';await page.locator('#draft-body').fill(offlineBody);await page.locator('#draft-body').press('Control+End');await context.setOffline(true);await page.getByRole('button',{name:'保存草稿',exact:true}).click();await expect(page.locator('#message')).toContainText('NETWORK_UNCONFIRMED');await expect(page.locator('#draft-body')).toHaveValue(offlineBody);await expect(page.locator('#draft-title')).toBeEnabled();await expect(page.locator('#draft-body')).toBeEnabled();await expect(page.getByRole('button',{name:'保存草稿',exact:true})).toBeDisabled();await page.locator('#draft-body').press('End');await page.keyboard.type('失败后可以继续编辑。');const afterFailureBody=offlineBody+'失败后可以继续编辑。';await expect(page.locator('#draft-body')).toHaveValue(afterFailureBody);await shot(page,'05-network-unconfirmed',true);
      await context.setOffline(false);await page.getByRole('button',{name:'读取当前稿',exact:true}).click();await expect(page.locator('#remote-body')).toHaveValue(body);await expect(page.locator('#draft-body')).toHaveValue(afterFailureBody);await shot(page,'network-recovered');
      await page.getByRole('button',{name:'以当前稿重新编辑',exact:true}).click();await expect(page.locator('#draft-body')).toHaveValue(body);await expect(page.locator('#edit-state')).toHaveText('与已读取稿一致');
      await page.locator('.chapter[data-number="3"]').click();await expect(page.locator('#revision')).toHaveText('读取 r1 · 草稿 · 依据有变动');await shot(page,'06-following-basis');
      await page.locator('.chapter[data-number="2"]').click();await expect(page.locator('#draft-body')).toHaveValue(body);
      const after={work:store.getWork(initial.work.id),chapters:store.listChapters(initial.work.id).map(c=>store.getChapter(initial.work.id,c.number)),summary:store.exportWork(initial.work.id)};
      await writeFile(resolve(target,'fixture-final.json'),JSON.stringify(after,null,2));
      if(after.chapters[1].body!==body||after.chapters[1].revision!==2||after.chapters[1].origin!=='human'||after.summary.chapters[2].basisCurrent!==false)throw new Error('读回业务状态不符');
      const report={variant,workId:initial.work.id,db,url,initialBodyDigests:initial.chapters.map(c=>createHash('sha256').update(c.body).digest('hex')),sameBusinessInput:initial.chapters.map(c=>({number:c.number,title:c.title,body:c.body,status:c.status,revision:c.revision})),screenshots,pageErrors,states:['当前稿','有未保存修改','2500ms受控等待期间章名和正文禁用，键盘输入不进入字段','保存并读回 r2，字段恢复编辑','旧窗口 r1 保存被拒绝且修改保留','读回当前稿与本地稿对照','网络断开请求未确认且修改保留，失败后字段恢复并实际继续编辑','恢复后真实重读且继续编辑的本地文字保留','后章依据有变动'],verdict:'实际点击、输入、真实 HTTP、Store 读回与文本核对通过；界面口吻由实际截图另评，不把脚本通过当审美通过。'};
      if(pageErrors.length)throw new Error('浏览器未处理错误 '+pageErrors.join(';'));
      await writeFile(resolve(target,'report.json'),JSON.stringify(report,null,2));metadata.variants.push(report);
    }finally{await Promise.allSettled(pending);await writeFile(resolve(target,'http-events.json'),JSON.stringify(calls,null,2));await context.close();await new Promise((r,j)=>server.close(e=>e?j(e):r()));store.close();}
  }
  await writeFile(resolve(dir,'complete.json'),JSON.stringify(metadata,null,2));console.log(JSON.stringify({runId,dir,codeVersion,dirty:!!dirty,variants:metadata.variants.map(v=>v.variant)}));
}catch(error){await writeFile(resolve(dir,'FAILED.txt'),'本次全部帧不作为通过证据。\n'+error.stack);throw error;}finally{await browser.close();}
