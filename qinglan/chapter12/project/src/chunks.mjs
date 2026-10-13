import assert from 'node:assert/strict';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { sha256 } from './materials.mjs';

export const conditions = [
  { id: 'fixed80', label: '固定长度', chunkSize: 80, chunkOverlap: 0, separators: [''], expandParent: false },
  { id: 'structure80', label: '先段落，再标点', chunkSize: 80, chunkOverlap: 0, separators: ['\n\n', '\n', '。', '！', '？', '；', '，', ''], expandParent: false },
  { id: 'overlap80x40', label: '重叠40', chunkSize: 80, chunkOverlap: 40, separators: [''], expandParent: false },
  { id: 'parent80', label: '命中子块，返回所在页', chunkSize: 80, chunkOverlap: 0, separators: [''], expandParent: true },
];

function locate(text, chunks, pages, condition) {
  let previous = -1;
  return chunks.map((content, index) => {
    // 按顺序保留正文位置；相邻重叠块仍须向前推进，不能借用另一处同句。
    const start = text.indexOf(content, previous + 1);
    assert(start >= 0, '切块未能原样回到完整正文'); previous = start;
    const end = start + content.length;
    const parents = pages.filter(page => start < page.bodyRange.end && end > page.bodyRange.start);
    assert(parents.length, '切块没有对应原页');
    return { chunkId: sha256(JSON.stringify({ bodySha256: sha256(text), condition: condition.id, index, content, start })), index, text: content,
      utf16Length: content.length, bodyRange: { start, end, positionUnit: 'utf16' }, parentIds: parents.map(page => page.parentId), sourcePages: parents.map(page => page.physicalPage) };
  });
}
export async function compareChunks(text, pages, terms) {
  const methods = [];
  for (const condition of conditions) {
    const chunks = condition.expandParent ? methods[0].chunks : locate(text, await new RecursiveCharacterTextSplitter({ ...condition, keepSeparator: true, lengthFunction: value => value.length }).splitText(text), pages, condition);
    const retrievals = terms.map(term => {
      const allHits = chunks.filter(chunk => chunk.text.includes(term));
      const first = allHits[0];
      const parents = first ? pages.filter(page => first.parentIds.includes(page.parentId)) : [];
      const context = first ? (condition.expandParent ? parents.map(page => page.body).join('\n\n') : first.text) : '';
      return { term, selection: '按正文顺序取第一个字面命中；不按语义排名', allHitIds: allHits.map(chunk => chunk.chunkId), selectedChunk: first ?? null,
        returnedParents: condition.expandParent ? parents : [], context, contextUtf16Length: context.length };
    });
    methods.push({ condition, chunks, retrievals, totalChunkUtf16Length: chunks.reduce((sum, chunk) => sum + chunk.text.length, 0) });
  }
  return methods;
}
