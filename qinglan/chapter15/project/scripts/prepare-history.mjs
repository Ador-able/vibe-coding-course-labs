import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(...args)=>execFileSync('git',args);
const oldTag='vcm-09-02-start',old=git('show',oldTag+':project/prototype/app.js'),correct=readFileSync('prototype/app.js');
const oldBusy=old.toString('utf8').split(/\r?\n/).find(line=>line.startsWith('function setBusy('));
const correctBusy=correct.toString('utf8').split(/\r?\n/).find(line=>line.startsWith('function setBusy('));
if(!oldBusy||!correctBusy)throw new Error('实际旧/新函数未找到。');
const restored=correct.toString('utf8').replace(correctBusy,oldBusy).replace("$('draft-title').disabled=busy;$('draft-body').disabled=busy;","$('draft-title').disabled=false;$('draft-body').disabled=false;");
mkdirSync('materials/historical',{recursive:true});
writeFileSync('materials/historical/原始旧app.js.txt',old);
writeFileSync('materials/historical/保存等待历史行为.json',JSON.stringify({kind:'derived_historical_regression_fixture',oldTag,oldTagGit:git('rev-parse',oldTag).toString().trim(),oldSourcePath:'project/prototype/app.js',oldSourceBytes:old.length,oldSourceSha256:sha(old),currentCorrectBytes:correct.length,currentCorrectSha256:sha(correct),oldBusy,correctBusy,restoredBytes:Buffer.byteLength(restored),restoredSha256:sha(Buffer.from(restored)),scope:'只在当前单一工作台中恢复历史setBusy未暂停编辑、render将编辑重新启用的两个行为。不是旧三布局应用全文，也不是当前正确应用新发现仍坏。',changes:['setBusy恢复实际历史函数，不暂停章名/正文/覆盖编辑。','render的两编辑字段恢复disabled=false，其余当前单界面代码保持。']},null,2)+'\n');
const patch=['--- 当前正确的单一工作台','+++ 历史等待行为恢复副本','@@ setBusy @@','-'+correctBusy,'+'+oldBusy,'@@ render @@',"-$('draft-title').disabled=busy;$('draft-body').disabled=busy;","+$('draft-title').disabled=false;$('draft-body').disabled=false;",''].join('\n');
writeFileSync('materials/historical/保存等待旧缺陷差异.patch',patch);
console.log(JSON.stringify({oldTag,oldSourceSha256:sha(old),currentCorrectSha256:sha(correct),restoredSha256:sha(Buffer.from(restored)),modelRequests:0,restoredApplication:false}));
