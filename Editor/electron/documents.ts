import { readFile, writeFile, mkdir, rename, unlink, stat, readdir, copyFile, lstat, rmdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { robloxStrategy } from '../src/editor/roblox';
import type { UIDocument } from '../src/shared/uiDocument';
import type { DocumentAsset, DocumentLibrary } from '../src/shared/documents';

export function documentAssetDirectory(rootPath: string, library: DocumentLibrary): string {
  return join(rootPath, { project: 'interfaces', templates: join('styles', 'templates'), permanent: 'ui-assets' }[library]);
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
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
        assets.push({ name: documentStem(entry.name), path });
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
  const target = documentBundlePath(join(documentAssetDirectory(targetRoot, targetLibrary), basename(source.path)));
  await mkdir(dirname(dirname(target)), { recursive: true });
  try { await mkdir(dirname(target)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('目标文件夹已有同名UI，请先改名后再移动。'); throw error; }
  const sources = [source.path, ...Object.values(documentScriptPaths(source.path))];
  const targets = [target, ...Object.values(documentScriptPaths(target))];
  const copied: string[] = [];
  const originals: string[] = [];
  try {
    for (let index = 0; index < sources.length; index++) {
      if (!(await fileInfo(sources[index]))) continue;
      await copyFile(sources[index], targets[index], constants.COPYFILE_EXCL);
      copied.push(targets[index]); originals.push(sources[index]);
    }
  } catch (error) {
    await Promise.all(copied.map(path => unlink(path)));
    await rmdir(dirname(target));
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('目标文件夹已有同名UI或脚本，请先改名后再移动。');
    throw error;
  }
  // Restore already removed sources if a later removal fails.
  const removed: string[] = [];
  try { for (const path of originals) { await unlink(path); removed.push(path); } }
  catch (error) {
    for (const path of removed) await copyFile(targets[sources.indexOf(path)], path, constants.COPYFILE_EXCL);
    await Promise.all(copied.map(path => unlink(path)));
    await rmdir(dirname(target));
    throw error;
  }
  if (basename(dirname(source.path)) === documentStem(basename(source.path))) await rmdir(dirname(source.path)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOTEMPTY') throw error; });
  return { path: target, name: documentStem(basename(target)) };
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
  const folders: string[] = [];
  for (const entry of entries.filter(entry => entry.isDirectory())) {
    const bundle = join(documentAssetDirectory(root, 'templates'), entry.name, `${entry.name}.json`);
    if (!await fileInfo(bundle)) folders.push(entry.name);
  }
  return folders.sort((a, b) => a.localeCompare(b, 'zh-CN'));
}
export function documentStem(path: string): string {
  return path.replace(/(?:\.rbxui)?\.json$/i, '');
}
/** Each saved UI owns a directory named after its file stem. */
export function documentBundlePath(path: string): string {
  const stem = documentStem(basename(path));
  return basename(dirname(path)) === stem ? path : join(dirname(path), stem, basename(path));
}
export async function saveDocumentBundle(path: string, source: unknown) {
  const document = robloxStrategy.validate(source);
  const oldStem = documentStem(basename(path));
  const oldDirectory = dirname(path);
  if (basename(oldDirectory) !== oldStem || document.name === (await readDocument(path)).name || safeFileName(document.name) === oldStem) {
    return { path, document: await writeDocument(path, document) };
  }
  const name = safeFileName(document.name);
  const directory = join(dirname(oldDirectory), name);
  const target = join(directory, `${name}.json`);
  const info = await lstat(oldDirectory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('UI 目录必须是普通目录。');
  const sameCase = process.platform === 'win32' && oldDirectory.toLowerCase() === directory.toLowerCase();
  if (!sameCase && await lstat(directory).then(() => true, (error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return false; throw error; })) throw new Error('已有同名 UI 目录，请使用其他名称。');
  const oldFiles = [path, ...Object.values(documentScriptPaths(path))];
  const newFiles = [target, ...Object.values(documentScriptPaths(target))];
  for (const file of oldFiles) await fileInfo(file);
  for (const file of newFiles) {
    const oldLocation = join(oldDirectory, basename(file));
    if (!oldFiles.some(old => process.platform === 'win32' ? old.toLowerCase() === oldLocation.toLowerCase() : old === oldLocation) && await fileInfo(oldLocation)) throw new Error('UI 目录内已有改名目标文件，未覆盖。');
  }
  // Renaming the directory keeps project-authored companion files together.
  const temporary = sameCase ? join(dirname(oldDirectory), `ui-${randomUUID()}.tmp`) : null;
  if (temporary) { await rename(oldDirectory, temporary); await rename(temporary, directory).catch(async error => { await rename(temporary, oldDirectory); throw error; }); }
  else await rename(oldDirectory, directory);
  const moved: { from: string; to: string }[] = [];
  try {
    for (let index = 0; index < oldFiles.length; index++) {
      const from = join(directory, basename(oldFiles[index])), to = newFiles[index];
      await rename(from, to); moved.push({ from, to });
    }
    return { path: target, document: await writeDocument(target, document) };
  } catch (error) {
    for (const file of moved.reverse()) await rename(file.to, file.from);
    await rename(directory, oldDirectory);
    throw error;
  }
}
export function documentScriptPaths(path: string) {
  const stem = documentStem(path);
  return { source: `${stem}.view.luau`, integration: `${stem}.example.luau` };
}
async function fileInfo(path: string) {
  const info = await lstat(path).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  if (info && (!info.isFile() || info.isSymbolicLink())) throw new Error(`界面文件或脚本必须是普通文件：${path}`);
  return info;
}
export function documentFiles(path: string, source: unknown): { path: string; content: string }[] {
  const document = robloxStrategy.validate(source);
  const { scripts, ...ui } = document;
  const paths = documentScriptPaths(path);
  const content = JSON.stringify({ ...ui, version: 4 }, null, 2) + '\n';
  if (Buffer.byteLength(content) > 32 * 1024 * 1024) throw new Error('界面文件超过 32 MiB。');
  return [{ path: paths.source, content: scripts.source }, { path: paths.integration, content: scripts.integration }, { path, content }];
}
export async function readDocument(path: string): Promise<UIDocument> {
  if ((await fileInfo(path) ?? await stat(path)).size > 32 * 1024 * 1024) throw new Error('界面文件超过 32 MiB。');
  let source: unknown;
  try { source = JSON.parse(await readFile(path, 'utf8')); } catch { throw new Error('界面 JSON 无法解析，请检查文件。'); }
  const split = !!source && typeof source === 'object' && (source as { version?: unknown }).version === 4;
  if (!split) return robloxStrategy.validate(source);
  const ui = source as Record<string, unknown>;
  if (Object.hasOwn(ui, 'scripts')) throw new Error('版本 4 的界面 JSON 不应包含 scripts，请使用同名 Luau 文件。');
  const scripts = {} as UIDocument['scripts'];
  for (const [kind, scriptPath] of Object.entries(documentScriptPaths(path))) {
    const info = await fileInfo(scriptPath);
    if (!info) throw new Error(`缺少界面脚本：${scriptPath}`);
    if (info.size > 1024 * 1024) throw new Error('单份脚本不能超过 1 MiB。');
    scripts[kind as keyof typeof scripts] = await readFile(scriptPath, 'utf8');
  }
  return robloxStrategy.validate({ ...ui, version: 3, scripts });
}
export async function writeDocument(path: string, source: unknown): Promise<UIDocument> {
  const document = robloxStrategy.validate(source);
  const files = documentFiles(path, document);
  // Stage all three before replacing any destination; restore earlier replacements on failure.
  await mkdir(dirname(path), { recursive: true });
  const staged: { path: string; temporary: string; previous: Buffer | null }[] = [];
  const committed: typeof staged = [];
  try {
    for (const file of files) {
      const previous = await fileInfo(file.path) ? await readFile(file.path) : null;
      const temporary = join(dirname(path), `ui-${randomUUID()}.tmp`);
      staged.push({ path: file.path, temporary, previous });
      await writeFile(temporary, file.content, { flag: 'wx' });
    }
    for (const file of staged) { await rename(file.temporary, file.path); committed.push(file); }
  } catch (error) {
    for (const file of committed.reverse()) {
      if (file.previous === null) await unlink(file.path);
      else await writeFile(file.path, file.previous);
    }
    throw error;
  } finally { await Promise.all(staged.map(file => unlink(file.temporary).catch(() => {}))); }
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
