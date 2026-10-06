import { readFile, writeFile, mkdir, rename, unlink, stat, readdir } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { robloxStrategy } from '../src/editor/roblox';
import type { UIDocument } from '../src/shared/uiDocument';
import type { DocumentAsset } from '../src/shared/documents';

export async function listDocumentAssets(projectPath: string): Promise<DocumentAsset[]> {
  const directory = join(projectPath, 'interfaces');
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  return entries.filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.rbxui.json'))
    .map(entry => ({ name: entry.name.slice(0, -11), path: join(directory, entry.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

export async function openDocumentAsset(projectPath: string, path: unknown) {
  const asset = (await listDocumentAssets(projectPath)).find(item => item.path === path);
  if (!asset) throw new Error('界面资产不在当前工程中，请刷新后重试。');
  return { path: asset.path, document: await readDocument(asset.path) };
}

export function safeFileName(name: string): string {
  const clean = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 100) || '未命名界面';
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean) ? `_${clean}` : clean;
}
export async function readDocument(path: string): Promise<UIDocument> {
  if ((await stat(path)).size > 32 * 1024 * 1024) throw new Error('界面文件超过 32 MiB。');
  let source: unknown;
  try { source = JSON.parse(await readFile(path, 'utf8')); } catch { throw new Error('界面 JSON 无法解析，请检查文件。'); }
  return robloxStrategy.validate(source);
}
export async function writeDocument(path: string, source: unknown): Promise<UIDocument> {
  const document = robloxStrategy.validate(source);
  const content = JSON.stringify(document, null, 2) + '\n';
  if (Buffer.byteLength(content) > 32 * 1024 * 1024) throw new Error('界面文件超过 32 MiB。');
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `ui-${randomUUID()}.tmp`);
  try { await writeFile(temporary, content, { flag: 'wx' }); await rename(temporary, path); }
  finally { await unlink(temporary).catch(() => {}); }
  return document;
}
export async function readPreviewImage(path: string) {
  if ((await stat(path)).size > 10 * 1024 * 1024) throw new Error('图片不能超过 10 MiB。');
  const bytes = await readFile(path);
  let type: string;
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) type = 'png';
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) type = 'jpeg';
  else if (['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString())) type = 'gif';
  else if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') type = 'webp';
  else throw new Error('仅支持 PNG/JPEG/WebP/GIF 图片。');
  return { name: basename(path), dataUrl: `data:image/${type};base64,${bytes.toString('base64')}` };
}
