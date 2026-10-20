import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ModelError } from '../model.ts';

export async function openMaterials(projectDirectory: string) {
  const manifest = JSON.parse(await readFile(join(projectDirectory, '创作资料清单.json'), 'utf8')) as { files: { id: string; path: string; sha256: string }[] };
  const files = new Map(manifest.files.map(file => [file.id, file]));
  async function read(path: string) {
    const file = files.get(path);
    if (!file) throw new ModelError('MODEL_RESPONSE_INVALID', '没有这个资料路径，请按入口或目录中的位置读取。', 400);
    const bytes = await readFile(join(projectDirectory, file.path));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== file.sha256) throw new Error(`资料与固定清单不一致：${path}`);
    return { path, text: bytes.toString('utf8'), sha256 };
  }
  return { paths: [...files.keys()], read };
}
export type Materials = Awaited<ReturnType<typeof openMaterials>>;
