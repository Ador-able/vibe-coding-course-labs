import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

// 只读指定课堂容器的两个原生存储对象，不重发文件业务。
const container=process.argv[2]||'fanren-ch14-classroom-20261015';
const evidence=JSON.parse(readFileSync(new URL('./实际存储字节核对.json',import.meta.url),'utf8'));
const root=new URL('../../../',import.meta.url);
for(const item of evidence.records){
  const code='const fs=require("fs"),crypto=require("crypto");const b=fs.readFileSync('+JSON.stringify(item.storagePath)+');console.log(JSON.stringify({bytes:b.length,sha256:crypto.createHash("sha256").update(b).digest("hex")}))';
  const result=spawnSync('docker',['exec',container,'node','-e',code],{encoding:'utf8'});
  if(result.status!==0)throw new Error(result.stderr);
  const actual=JSON.parse(result.stdout);
  const original=readFileSync(new URL('files/'+item.file,root));
  const digest=createHash('sha256').update(original).digest('hex');
  console.log(JSON.stringify({file:item.file,bytes:actual.bytes,sha256:actual.sha256,equal:actual.bytes===original.length&&actual.sha256===digest}));
}
