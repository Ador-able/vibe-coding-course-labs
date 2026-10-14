import {readFileSync} from 'node:fs';
import {workInput} from '../dist/schemas.js';

export const localScenes=JSON.parse(readFileSync(new URL('../materials/局部练习.json',import.meta.url),'utf8'));
// 局部练习使用独立数据库，不继承完整章节的篇幅与后续情节。
export const localWork=workInput.parse({
  id:localScenes.workId,title:'青岚修仙录',purpose:'用人工短片段观察工具、方法与反馈怎样作用于实际保存对象。',
  requirements:['只处理本轮指定的局部场景，保存为待审草稿；不采用，不扩写后章。'],
  facts:localScenes.sharedFacts,
  outline:[{number:1,titleHint:'阁门前',goal:'说明来意，等待执事核对身份并放行。'},{number:2,titleHint:'再到阁前',goal:'按当前事实接续；只在本轮明确要求时保存。'}],
});
