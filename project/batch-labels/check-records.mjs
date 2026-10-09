import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root=dirname(fileURLToPath(import.meta.url));
const sha=value=>createHash('sha256').update(value).digest('hex');
const read=path=>readFile(join(root,path),'utf8');
const source=await read('inputs/records.json'),records=JSON.parse(source).records;
const instructions=await read('prompts/instructions.txt');
const stageProof=[];
for(const stage of ['discovery','v1','v2']){
  const report=JSON.parse(await read('runs/'+stage+'-01/report.json'));
  const template=await read('prompts/'+(stage==='discovery'?'discover':'classify')+'.txt');
  const codebook=stage==='discovery'?'':await read('inputs/codebook-'+stage+'.json');
  assert.equal(report.sourceSha256,sha(source));assert.equal(report.instructionsSha256,sha(instructions));assert.equal(report.templateSha256,sha(template));assert.equal(report.codebookSha256,codebook?sha(codebook):null);
  assert.equal(report.requestCount,2);assert.equal(report.calls.length,2);
  const calls=[];
  for(let i=0;i<2;i++){
    const call=report.calls[i],folder='runs/'+stage+'-01/batch-'+(i+1);
    const batch=records.slice(i*6,(i+1)*6);
    const expectedPrompt=template.replace(/\{(records|codebook|version)\}/g,(_,key)=>({records:JSON.stringify(batch,null,2),codebook,version:stage})[key]);
    const prompt=await read(folder+'/prompt.txt'),savedInstructions=await read(folder+'/instructions.txt'),output=await read(folder+'/output.txt');
    const requestRaw=await read(folder+'/request-body.json'),responseRaw=await read(folder+'/response-body.txt');
    const request=JSON.parse(requestRaw),response=JSON.parse(responseRaw);
    assert.equal(prompt,expectedPrompt);assert.equal(promptSha(prompt),call.promptSha256);assert.equal(savedInstructions,instructions);assert.equal(output,call.result.text);
    assert.deepEqual(call.recordIds,batch.map(x=>x.id));assert.equal(call.http.length,1);assert.equal(call.http[0].status,200);
    assert.equal(call.http[0].requestBody,requestRaw);assert.equal(call.http[0].responseBody,responseRaw);
    assert.equal(request.model,report.settings.modelId);assert.equal(request.temperature,0);assert.equal(request.max_tokens,4096);assert.deepEqual(request.messages,[{role:'system',content:instructions},{role:'user',content:prompt}]);
    assert.equal(response.choices[0].message.content,output);assert.equal(response.choices[0].finish_reason,call.result.rawFinishReason);
    assert.equal(response.usage.prompt_tokens,call.result.usage.inputTokens);assert.equal(response.usage.completion_tokens,call.result.usage.outputTokens);
    calls.push({id:call.id,recordIds:call.recordIds,requestSha256:sha(requestRaw),responseSha256:sha(responseRaw),outputSha256:sha(output),fullInputsExact:true,fullOutputExact:true,usageExact:true});
  }
  stageProof.push({stage,calls,sourceExact:true,instructionsExact:true,codebookExact:true});
}
function promptSha(value){return sha(value);}
const proof={passed:true,stages:stageProof,requests:6,modelCallsAdded:0,scope:'核现有材料、六次真实发送/返回和对应关系，不证明分类内容正确。'};
await writeFile(join(root,'runs/request-response-check.json'),JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({passed:true,requests:6,modelCallsAdded:0}));

