import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {compareChunks} from '../src/chunks.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bodyRaw=await fs.readFile(path.join(root,'inputs/小说第三章完整原文.txt'));
const mappingRaw=await fs.readFile(path.join(root,'inputs/第三章页正文与位置.json'));
const mapping=JSON.parse(mappingRaw),startedAt=new Date().toISOString(),runId=randomUUID();
const hash=x=>createHash('sha256').update(x).digest('hex');
const methods=await compareChunks(bodyRaw.toString('utf8'),mapping.parentPages);
const result={runId,startedAt,finishedAt:new Date().toISOString(),
 gitHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
 nodeVersion:process.version,components:{textsplitters:'1.0.2',core:'1.2.14'},
 bodySha256:hash(bodyRaw),mappingSha256:hash(mappingRaw),bodyUtf16Length:bodyRaw.toString('utf8').length,
 sourceRunId:mapping.sourceRunId,sourceObservationSha256:mapping.sourceObservationSha256,
 conditionsScope:'刻意小的80 UTF-16码元上限；比较四种切法与同一字面选取规则，不评价检索排名、向量质量或生产最佳参数。',
 methods,newPdfReads:0,newModelCalls:0};
const dir=path.join(root,'runs',runId);await fs.mkdir(dir,{recursive:true});
const raw=JSON.stringify(result,null,2)+'\n';
await fs.writeFile(path.join(dir,'完整切分与检索结果.json'),raw);
await fs.writeFile(path.join(root,'public/chunks.json'),raw);
console.log(JSON.stringify({runId,gitHead:result.gitHead,methods:methods.map(x=>({id:x.condition.id,chunks:x.chunks.length,
  totalLength:x.totalChunkUtf16Length,retrievals:x.retrievals.map(y=>({term:y.term,context:y.context,length:y.contextUtf16Length}))})),newModelCalls:0}));
