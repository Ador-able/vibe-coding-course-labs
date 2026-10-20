type SaveResult =
  | { status: 'saved'; file: string }
  | { status: 'failed'; reason: string };

function explain(result: SaveResult): string {
  if (result.status === 'saved') return `文件已写入：${result.file}`;
  return `未取得保存结果：${result.reason}`;
}
