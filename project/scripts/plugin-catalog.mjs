import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import {writeFile} from 'node:fs/promises';

const {values}=parseArgs({options:{output:{type:'string'}}});
const require=createRequire(import.meta.resolve('@openai/codex-sdk'));
const entry=require.resolve('@openai/codex/bin/codex.js');
const overrides=['-c',`marketplaces.novel-agent-lab.source=${JSON.stringify(process.cwd())}`,'-c','marketplaces.novel-agent-lab.source_type="local"','-c','plugins.novel-practice@novel-agent-lab.enabled=true'];
const text=execFileSync(process.execPath,[entry,...overrides,'plugin','list','--marketplace','novel-agent-lab','--json','--available'],{encoding:'utf8'});
JSON.parse(text);
if(values.output)await writeFile(values.output,text,'utf8');
process.stdout.write(text);
