import { readFile, writeFile, mkdir, rename, unlink, stat, readdir, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { robloxStrategy } from '../src/editor/roblox';
import type { UIDocument } from '../src/shared/uiDocument';
import type { DocumentAsset, DocumentLibrary } from '../src/shared/documents';

export function documentAssetDirectory(rootPath: string, library: DocumentLibrary): string {
  return join(rootPath, { project: 'interfaces', templates: 'template-references', permanent: 'ui-assets' }[library]);
}

export async function listDocumentAssets(rootPath: string, library: DocumentLibrary = 'project'): Promise<DocumentAsset[]> {
  const directory = documentAssetDirectory(rootPath, library);
  async function collect(directory: string): Promise<DocumentAsset[]> {
    const entries = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const assets: DocumentAsset[] = [];
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) assets.push(...await collect(path));
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.rbxui.json')) {
        assets.push({ name: entry.name.slice(0, -11), path });
      }
    }
    return assets;
  }
  return (await collect(directory)).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.path.localeCompare(b.path, 'zh-CN'));
}

export async function openDocumentAsset(rootPath: string, path: unknown, library: DocumentLibrary = 'project') {
  const asset = (await listDocumentAssets(rootPath, library)).find(item => item.path === path);
  if (!asset) throw new Error(library === 'templates' ? '界面资产不在模板参考库中，请刷新后重试。' : library === 'permanent' ? '界面资产不在永久UI库中，请刷新后重试。' : '界面资产不在当前工程中，请刷新后重试。');
  return { path: asset.path, document: await readDocument(asset.path) };
}

export async function moveDocumentAsset(sourceRoot: string, path: unknown, sourceLibrary: DocumentLibrary, targetRoot: string, targetLibrary: DocumentLibrary): Promise<DocumentAsset> {
  if (sourceLibrary === targetLibrary) throw new Error('请选择其他资产文件夹。');
  const source = await openDocumentAsset(sourceRoot, path, sourceLibrary);
  const target = join(documentAssetDirectory(targetRoot, targetLibrary), basename(source.path));
  await mkdir(dirname(target), { recursive: true });
  try { await copyFile(source.path, target, constants.COPYFILE_EXCL); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('目标文件夹已有同名UI，请先改名后再移动。');
    throw error;
  }
  try { await unlink(source.path); }
  catch (error) { await unlink(target); throw error; }
  return { path: target, name: basename(target).slice(0, -11) };
}

export function safeFileName(name: string): string {
  const clean = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 100) || '未命名界面';
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean) ? `_${clean}` : clean;
}
export function templateFolderPath(root: string, name: unknown): string {
  if (typeof name !== 'string' || !name.trim() || name !== safeFileName(name) || name === '.' || name === '..') throw new Error('文件夹名称无效，请勿使用路径或特殊字符。');
  return join(documentAssetDirectory(root, 'templates'), name);
}
export async function listTemplateFolders(root: string): Promise<string[]> {
  const entries = await readdir(documentAssetDirectory(root, 'templates'), { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort((a, b) => a.localeCompare(b, 'zh-CN'));
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
  if ((await stat(path)).size > 8 * 1024 * 1024) throw new Error('图片不能超过 8 MiB。');
  const bytes = await readFile(path);
  let type: string;
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) type = 'png';
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) type = 'jpeg';
  else if (['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString())) type = 'gif';
  else if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') type = 'webp';
  else throw new Error('仅支持 PNG/JPEG/WebP/GIF 图片。');
  return { name: basename(path), dataUrl: `data:image/${type};base64,${bytes.toString('base64')}` };
}
