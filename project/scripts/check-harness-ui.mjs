import {chromium,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {Store} from '../dist/store.js';
import {prototypeServer} from '../dist/prototype-http.js';

const runId=randomUUID(),out=resolve('runs','pre-model-ui-'+runId);
await mkdir(out,{recursive:true});
const base='http://127.0.0.1:4337';
const mainId='harness-02f7db59-e6a1-4e9a-8c4d-75adfa2a1fea';
const main=await fetch(base+'/api/work?work='+mainId).then(response=>response.json());
if(main.work.id!==mainId||main.chapters.length)throw new Error('本次正式作品不是预期的零章起点，停止预检。');
const variants=['original','desk','notes'];
const viewport={width:1360,height:900},mobileViewport={width:390,height:844};
const humanId='human-ui-'+randomUUID();
const input={id:humanId,title:'人工界面测试',purpose:'核对编辑行为，不是模型输出。',requirements:['保存完整人工测试文字。'],facts:['本文由人提供，不能冒充本次小说生成。'],outline:[{number:1,titleHint:'人工测试章',goal:'核对读回、等待、失败与旧修订。'}]};
const title='人工测试章';
const initialBody='这是独立数据库中的人工测试文字。\n它只用于检查编辑状态，不是课堂小说，也不是模型生成结果。';
const editedBody=initialBody+'\n人工修改：保存这句测试文字。';
const baseline=resolve(out,'human-baseline.sqlite'),seedStore=new Store(baseline);
seedStore.init(input);
seedStore.saveDraft({workId:humanId,chapterNumber:1,expectedWorkRevision:1,expectedChapterRevision:0,expectedPreviousRevisions:[],title,body:initialBody},'human');
seedStore.close();
const metadata={runId,out,codeVersion:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),gitStatus:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),viewport,mobileViewport,browser:'本机 Edge / Playwright 1.63.0，无登录隔离上下文',main,humanInput:input,humanTitle:title,humanInitialBody:initialBody,humanEditedBody:editedBody,modelCalled:false,variants:[]};
await writeFile(resolve(out,'input.json'),JSON.stringify(metadata,null,2));
const browser=await chromium.launch({channel:'msedge',headless:true});
const state=async page=>page.evaluate(()=>({workTitle:document.querySelector('#work-title').textContent,chapter:document.querySelector('#chapter-label').textContent,heading:document.querySelector('#chapter-heading').textContent,revision:document.querySelector('#revision').textContent,message:document.querySelector('#message').textContent,editState:document.querySelector('#edit-state').textContent,title:document.querySelector('#draft-title').value,body:document.querySelector('#draft-body').value,titleDisabled:document.querySelector('#draft-title').disabled,bodyDisabled:document.querySelector('#draft-body').disabled,saveDisabled:document.querySelector('#save').disabled,readCurrentHidden:document.querySelector('#read-current').hidden,comparisonHidden:document.querySelector('#comparison').hidden,remoteBody:document.querySelector('#remote-body').value,context:document.querySelector('#work-context').innerText,scrollWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth}));
try{
  for(const variant of variants){
    const target=resolve(out,variant);await mkdir(target,{recursive:true});
    const context=await browser.newContext({viewport,locale:'zh-CN',colorScheme:'light'});
    const page=await context.newPage(),calls=[],pending=[],errors=[];
    const attach=page=>{
      page.on('pageerror',error=>errors.push(error.message));
      page.on('response',response=>{if(!new URL(response.url()).pathname.startsWith('/api/'))return;pending.push((async()=>{const request=response.request();calls.push({method:request.method(),url:request.url(),request:request.postData()?JSON.parse(request.postData()):null,status:response.status(),response:await response.json()});})());});
      page.on('requestfailed',request=>{if(new URL(request.url()).pathname.startsWith('/api/'))calls.push({method:request.method(),url:request.url(),request:request.postData()?JSON.parse(request.postData()):null,networkFailure:request.failure()});});
    };
    attach(page);
    const shots=[];
    const shot=async(page,name)=>{const path=resolve(target,name+'.png');await page.screenshot({path,fullPage:true});shots.push(path);};
    let server=null,store=null;
    const states={};
    try{
      // 延迟真实读取，不替换服务返回。
      let release;const gate=new Promise(resolve=>release=resolve);
      await page.route('**/api/work?*',async route=>{await gate;await route.continue();});
      await page.goto(base+'/?work='+mainId+'&chapter=1&variant='+variant,{waitUntil:'domcontentloaded'});
      await expect(page.locator('#reload')).toBeDisabled();
      await expect(page.locator('#draft-title')).toBeDisabled();await expect(page.locator('#draft-body')).toBeDisabled();
      states.emptyReading=await state(page);await shot(page,'00-empty-reading');
      release();await expect(page.locator('#chapter-heading')).toHaveText('尚未保存');
      await page.unroute('**/api/work?*');
      await expect(page.locator('#message')).toHaveText('第 1 章尚未保存。');
      await expect(page.locator('#draft-title')).toHaveValue('');await expect(page.locator('#draft-body')).toHaveValue('');
      await expect(page.locator('#draft-title')).toBeDisabled();await expect(page.locator('#draft-body')).toBeDisabled();await expect(page.locator('#save')).toBeDisabled();
      states.empty=await state(page);await shot(page,'01-empty');
      await page.setViewportSize(mobileViewport);states.emptyMobile=await state(page);await shot(page,'02-empty-mobile');
      if(states.emptyMobile.scrollWidth>states.emptyMobile.viewportWidth)throw new Error(variant+' 空章窄屏水平溢出');
      await page.setViewportSize(viewport);

      // 每种布局读取同一人工基线的独立字节副本，不写正式课堂作品。
      const database=resolve(target,'human.sqlite');await copyFile(baseline,database);
      store=new Store(database);server=prototypeServer(store,humanId);server.listen(0,'127.0.0.1');await once(server,'listening');
      const humanBase='http://127.0.0.1:'+server.address().port;
      const url=humanBase+'/?work='+humanId+'&chapter=1&variant='+variant;
      const old=await context.newPage();attach(old);
      await page.goto(url);await old.goto(url);
      await expect(page.locator('#draft-body')).toHaveValue(initialBody);await expect(old.locator('#draft-body')).toHaveValue(initialBody);
      states.humanCurrent=await state(page);await shot(page,'03-human-current');
      await page.locator('#draft-body').fill(editedBody);
      const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:1800,downloadThroughput:-1,uploadThroughput:-1});
      await page.locator('#save').click();await expect(page.locator('#message')).toHaveText('正在保存草稿。');
      await expect(page.locator('#draft-title')).toBeDisabled();await expect(page.locator('#draft-body')).toBeDisabled();
      await page.keyboard.type('等待期间不应进入正文。');await expect(page.locator('#draft-body')).toHaveValue(editedBody);
      states.humanSaving={...(await state(page)),controlledLatencyMilliseconds:1800,keyboardAttempt:'等待期间不应进入正文。'};
      await shot(page,'04-human-saving');
      await expect(page.locator('#message')).toHaveText('已保存草稿 r2，并读回当前正文。',{timeout:15000});
      await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await cdp.detach();
      await expect(page.locator('#draft-body')).toBeEnabled();await expect(page.locator('#draft-title')).toBeEnabled();await expect(page.locator('#draft-body')).toHaveValue(editedBody);
      assertBody(store.getChapter(humanId,1),editedBody,2);
      states.humanSaved=await state(page);await shot(page,'05-human-saved');

      const local=editedBody+'\n尚未确认的人工修改。';await page.locator('#draft-body').fill(local);
      await context.setOffline(true);await page.locator('#save').click();
      await expect(page.locator('#message')).toContainText('NETWORK_UNCONFIRMED');await expect(page.locator('#draft-body')).toHaveValue(local);
      await expect(page.locator('#draft-title')).toBeEnabled();await expect(page.locator('#draft-body')).toBeEnabled();await expect(page.locator('#save')).toBeDisabled();
      await page.locator('#draft-body').press('Control+End');await page.keyboard.type('失败后仍能编辑。');
      const afterFailure=local+'失败后仍能编辑。';await expect(page.locator('#draft-body')).toHaveValue(afterFailure);
      states.humanUnconfirmed=await state(page);
      if(states.humanUnconfirmed.message.split('本地修改仍保留').length!==2)throw new Error('失败提示出现重复或遗漏');
      await shot(page,'06-human-network-unconfirmed');await context.setOffline(false);
      await page.locator('#read-current').click();await expect(page.locator('#remote-body')).toHaveValue(editedBody);await expect(page.locator('#draft-body')).toHaveValue(afterFailure);
      states.humanRecovered=await state(page);

      const stale=initialBody+'\n旧窗口人工修改。';await old.locator('#draft-body').fill(stale);await old.locator('#save').click();
      await expect(old.locator('#message')).toContainText('STALE_CHAPTER');await expect(old.locator('#draft-body')).toHaveValue(stale);
      states.humanStale=await state(old);await shot(old,'07-human-stale');
      await old.locator('#read-current').click();await expect(old.locator('#remote-body')).toHaveValue(editedBody);await expect(old.locator('#draft-body')).toHaveValue(stale);
      states.humanStaleCompared=await state(old);
      assertBody(store.getChapter(humanId,1),editedBody,2);
      if(errors.length)throw new Error('浏览器未处理错误：'+errors.join(';'));
      const report={variant,database,humanId,states,shots,errors,modelCalled:false,scope:'正式作品只读取零章；保存实验使用人工短文独立数据库。功能检查不代表审美或模型任务通过。'};
      await writeFile(resolve(target,'report.json'),JSON.stringify(report,null,2));metadata.variants.push(report);
    }finally{
      await Promise.allSettled(pending);await writeFile(resolve(target,'http-events.json'),JSON.stringify(calls,null,2));
      await context.close();if(server)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));if(store)store.close();
    }
  }
  const current=await fetch(base+'/api/work?work='+mainId).then(response=>response.json());
  if(current.chapters.length||JSON.stringify(current)!==JSON.stringify(main))throw new Error('正式作品在人工界面预检期间发生变化。');
  await writeFile(resolve(out,'complete.json'),JSON.stringify(metadata,null,2));
  console.log(JSON.stringify({runId,out,variants:metadata.variants.map(item=>item.variant),screenshots:metadata.variants.flatMap(item=>item.shots).length,modelCalled:false}));
}catch(error){await writeFile(resolve(out,'FAILED.txt'),error.stack);throw error;}
finally{await browser.close();}

function assertBody(chapter,body,revision){if(!chapter||chapter.body!==body||chapter.revision!==revision||chapter.origin!=='human'||chapter.status!=='draft')throw new Error('人工业务读回与预期全文、修订或状态不同。');}
