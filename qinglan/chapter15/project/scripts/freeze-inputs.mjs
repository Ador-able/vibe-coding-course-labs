import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';

// 清单按实际原字节生成；换材料时原件与参考先同步，再固定新输入。
const files=readdirSync('inputs',{withFileTypes:true}).filter(item=>item.isFile()&&item.name!=='输入冻结清单.json').map(item=>item.name).sort().map(path=>{
  const bytes=readFileSync('inputs/'+path);return{path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
});
writeFileSync('inputs/输入冻结清单.json',JSON.stringify({files},null,2)+'\n');
console.log(JSON.stringify({files:files.length,modelRequests:0}));
