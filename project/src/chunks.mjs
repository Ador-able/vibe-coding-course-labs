import {RecursiveCharacterTextSplitter} from '@langchain/textsplitters';
import {createHash} from 'node:crypto';

export const conditions=[
 {id:'fixed80',label:'固定长度，无重叠',chunkSize:80,chunkOverlap:0,separators:[''],expandParent:false},
 {id:'structure80',label:'先段落，再标点',chunkSize:80,chunkOverlap:0,separators:['\n\n','\n','。','！','？','；','，',''],expandParent:false},
 {id:'overlap80x40',label:'固定长度，重叠40',chunkSize:80,chunkOverlap:40,separators:[''],expandParent:false},
 {id:'parent80',label:'同子块命中，带回所在页正文',chunkSize:80,chunkOverlap:0,separators:[''],expandParent:true},
];
export const queries=[{term:'卡住',purpose:'检查提问是否连同未知与理由带回'},
 {term:'保留',purpose:'检查末尾安排是否连同对象和时机带回'}];
const hash=x=>createHash('sha256').update(x).digest('hex');

function locate(text,chunks,pages,condition){
 let last=-1;
 return chunks.map((content,index)=>{
  // 此完整课堂文本中的各块可按顺序原样定位；通用含重复文本的资料需要自己的消歧规则。
  const start=text.indexOf(content,last+1);if(start<0)throw new Error('切出内容未能原样回到完整正文');
  last=start;const end=start+content.length;
  const sourcePages=pages.filter(x=>start<x.bodyRange.end&&end>x.bodyRange.start);
  return {chunkId:hash(JSON.stringify({bodySha256:hash(text),condition:condition.id,index,content})),index,
   text:content,utf16Length:content.length,bodyRange:{start,end,positionUnit:'utf16'},
   parentIds:sourcePages.map(x=>x.parentId),sourcePages:sourcePages.map(x=>x.physicalPage)};
 });
}

export async function compareChunks(text,pages){
 const methods=[];
 for(const condition of conditions){
  // 父子方式沿用完全相同的小块，只改变实际交给回答的范围。
  const chunks=condition.expandParent ? methods[0].chunks : locate(text,
   await new RecursiveCharacterTextSplitter({...condition,keepSeparator:true,lengthFunction:x=>x.length}).splitText(text),pages,condition);
  const retrievals=queries.map(query=>{
   const allHits=chunks.filter(x=>x.text.includes(query.term)),first=allHits[0];
   const parents=first?pages.filter(x=>first.parentIds.includes(x.parentId)):[];
   const context=first?(condition.expandParent?parents.map(x=>x.body).join('\n\n'):first.text):'';
   return {...query,selection:'按完整正文顺序取第一个字面命中；不按语义排序',allHitIds:allHits.map(x=>x.chunkId),
    selectedChunk:first??null,returnedParents:condition.expandParent?parents:[],context,contextUtf16Length:context.length};
  });
  methods.push({condition,chunks,totalChunkUtf16Length:chunks.reduce((n,x)=>n+x.text.length,0),retrievals});
 }
 return methods;
}
