import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

// 只复算已经给定的课堂排名与人工标注，不调用检索服务或模型。
const inputPath=path.join(import.meta.dirname,'input.json'),raw=await fs.readFile(inputPath),input=JSON.parse(raw);
const gain=grade=>2**grade-1,dcg=grades=>grades.reduce((sum,grade,index)=>sum+gain(grade)/Math.log2(index+2),0);
const rows=input.queries.map(q=>{
  const status={id:q.id,type:q.type,question:q.question,requestStatus:q.requestStatus,answerable:q.answerable,ranking:q.ranking};
  if(q.requestStatus!=='ok')return {...status,returnedPrecision:null,precisionAtK:null,recallAtK:null,reciprocalRank:null,dcgAtK:null,idcgAtK:null,ndcgAtK:null,evidenceCoverage:null};
  const top=q.ranking.slice(0,input.k),grades=top.map(id=>q.grades[id]??0),hits=grades.filter(g=>g>=input.relevantGradeThreshold).length;
  const relevant=Object.values(q.grades).filter(g=>g>=input.relevantGradeThreshold).length,first=grades.findIndex(g=>g>=input.relevantGradeThreshold);
  const ideal=Object.values(q.grades).sort((a,b)=>b-a).slice(0,input.k),actualDcg=dcg(grades),idealDcg=dcg(ideal);
  return {...status,top,grades,relevantInJudgedPool:relevant,hitsAtK:hits,returnedPrecision:top.length?hits/top.length:null,
    precisionAtK:hits/input.k,recallAtK:relevant?hits/relevant:null,reciprocalRank:q.answerable?(first<0?0:1/(first+1)):null,
    dcgAtK:actualDcg,idcgAtK:idealDcg,ndcgAtK:idealDcg?actualDcg/idealDcg:null,
    evidenceCoverage:q.requiredEvidence?q.requiredEvidence.filter(id=>top.includes(id)).length/q.requiredEvidence.length:null};
});
const fused=new Map();
for(const route of input.fusion.routes)for(const [index,id]of route.ranking.entries()){
  const row=fused.get(id)??{id,contributions:[],score:0},rank=index+input.fusion.rankStartsAt,contribution=1/(input.fusion.k+rank);
  row.contributions.push({route:route.name,rank,rawScore:route.rawScores[id],contribution});row.score+=contribution;fused.set(id,row);
}
const answerable=rows.filter(q=>q.answerable),successful=answerable.filter(q=>q.requestStatus==='ok');
const report={description:input.说明,k:input.k,input:{bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex')},
  rules:{binaryRelevance:'人工等级≥1；等级1只辅助回查，不能自动当完整答案',precisionAtK:'分母固定k；短列表空位按0',ndcg:'gain=2^grade−1；discount=log2(rank+1)；IDCG使用完整已标注池的理想前k项；IDCG=0记null',
    failure:'请求失败的条件检索指标记null；端到端答得出问题的MRR纳入该题并给0',noAnswer:'没有已确认答案的题不加入本练习答得出问题的MRR，另核是否保留未知'},
  rows,fusion:[...fused.values()].sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)),
  aggregate:{allRequests:rows.length,successfulRequests:rows.filter(q=>q.requestStatus==='ok').length,answerableQueries:answerable.length,successfulAnswerableQueries:successful.length,
    conditionalMrr:successful.reduce((n,q)=>n+q.reciprocalRank,0)/successful.length,endToEndMrr:answerable.reduce((n,q)=>n+(q.reciprocalRank??0),0)/answerable.length},
  limits:'人工编写的完整小样本和算术，不是检索器、嵌入、重排器或生成答案的实测。不能据此比较真实模型能力或作品品质。'};
const out=path.resolve(import.meta.dirname,process.argv[2]??'my-calculation.json');await fs.writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));
