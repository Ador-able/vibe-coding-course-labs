import test from 'node:test';
import assert from 'node:assert/strict';
import { executionProjection, workflowProjection } from '../src/native-rest.mjs';

test('公开投影保留完整业务原值与关联，移除账户和认证资料',()=>{
  const input={eventId:'qinglan-batch-E03',feedback:'林青借阅登记已经完成，却仍抱书站在阅书桌前。',failTask:'false'};
  const original={id:'7',workflowId:'wf-classroom',status:'success',mode:'webhook',privateAccount:{email:'private@example.com'},workflowData:{id:'wf-classroom',name:'青岚课堂',nodes:[],connections:{},settings:{},shared:[{user:{email:'private@example.com'}}]},data:{resultData:{runData:{'接收本轮完整批次':[{data:{main:[[{json:{headers:{cookie:'private-cookie',authorization:'private-token'},body:input},binary:{sourceFile:{data:'private-storage',id:'private-storage-id',mimeType:'application/pdf',fileName:'chapter-three.pdf'}}}]]}}],'保存本轮完整回执':[{data:{main:[[{json:{originalInputJson:JSON.stringify({task:input}),routeStatus:'needs_review',parentExecutionId:'6',childExecutionId:'7',notificationStatus:'not_sent'}}]]}}]}}}};
  const projected=executionProjection(original), text=JSON.stringify(projected);
  assert.deepEqual(projected.data.resultData.runData['接收本轮完整批次'][0].data.main[0][0].json.body,input);
  assert.equal(JSON.parse(projected.data.resultData.runData['保存本轮完整回执'][0].data.main[0][0].json.originalInputJson).task.failTask,'false');
  assert.ok(!text.includes('private-cookie')&&!text.includes('private-token')&&!text.includes('private@example.com')&&!text.includes('private-storage'));
  assert.equal(original.data.resultData.runData['接收本轮完整批次'][0].data.main[0][0].json.headers.cookie,'private-cookie');
  assert.deepEqual(workflowProjection({id:'w',name:'课堂',shared:[{user:'private'}]}),{id:'w',name:'课堂'});
});
