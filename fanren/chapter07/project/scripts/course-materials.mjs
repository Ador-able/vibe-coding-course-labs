import {readFileSync} from 'node:fs';
import {workInput} from '../dist/schemas.js';
export const localScenes=JSON.parse(readFileSync(new URL('../materials/局部练习.json',import.meta.url),'utf8'));
// 原文局部练习与完整三章阅读分别准备。
export const localWork=workInput.parse({
  id:localScenes.workId,title:'凡人修仙传',purpose:'用原文片段与明确标记的编辑占位观察保存、读取、方法和反馈。',
  requirements:['只处理本轮指定的短片段，保存为待审草稿；不自行采用，不扩写后章。','完整原文保留；占位符是人工技术条件。'],
  facts:localScenes.sharedFacts,
  outline:[{number:1,titleHint:'竹林喘息',goal:'核对坐下、回望师兄与继续赶路的原文关系。'},{number:2,titleHint:'走出竹林',goal:'对照C04开头检查体力与地形的接续。'}],
});
