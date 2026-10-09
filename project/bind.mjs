import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

const {values} = parseArgs({options:{
  'task-table':{type:'string'},'feedback-table':{type:'string'},
  'output':{type:'string'},'workflow-name':{type:'string'},'webhook-path':{type:'string'},
}});
const taskId = values['task-table'];
const feedbackId = values['feedback-table'];
if (![taskId,feedbackId].every(x=>typeof x==='string' && /^[A-Za-z0-9]{1,36}$/.test(x)) || taskId === feedbackId) {
  throw new Error('请分别提供实例实际返回的两张 Data Table ID。');
}
if (!values.output) throw new Error('请指定导入文件 --output。');
const workflow = JSON.parse(await fs.readFile(path.join(import.meta.dirname,'workflow.template.json'),'utf8'));
if (values['workflow-name']) workflow.name = values['workflow-name'];
const webhook = workflow.nodes.find(x=>x.type==='n8n-nodes-base.webhook');
if (values['webhook-path']) webhook.parameters.path = values['webhook-path'];
for (const node of workflow.nodes) {
  const locator = node.parameters.dataTableId;
  if (!locator) continue;
  locator.value = locator.value === '__TASK_TABLE_ID__' ? taskId : feedbackId;
}
const target = path.resolve(values.output);
await fs.mkdir(path.dirname(target),{recursive:true});
await fs.writeFile(target,JSON.stringify(workflow,null,2)+'\n');
console.log(JSON.stringify({file:target,workflowName:workflow.name,taskTableId:taskId,feedbackTableId:feedbackId,webhookPath:webhook.parameters.path,imported:false,published:false}));
