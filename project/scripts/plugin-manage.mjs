import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import {writeFile} from 'node:fs/promises';

const {values,positionals}=parseArgs({options:{output:{type:'string'}},allowPositionals:true});
const [action]=positionals;
if(positionals.length!==1||!['add','remove'].includes(action))throw new Error('操作须为 add 或 remove。');
const require=createRequire(import.meta.resolve('@openai/codex-sdk'));
const entry=require.resolve('@openai/codex/bin/codex.js');
const overrides=['-c',`marketplaces.novel-agent-lab.source=${JSON.stringify(process.cwd())}`,'-c','marketplaces.novel-agent-lab.source_type="local"'];
// 安装、移除均交给官方 CLI，目标固定为这个实验插件。
const text=execFileSync(process.execPath,[entry,...overrides,'plugin',action,'novel-practice@novel-agent-lab','--json'],{encoding:'utf8'});
JSON.parse(text);
if(values.output)await writeFile(values.output,text,'utf8');
process.stdout.write(text);
