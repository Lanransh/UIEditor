import { realpath, mkdir, stat, readdir, open, unlink, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, relative, isAbsolute, dirname } from 'node:path';
import { readDocument, writeDocument, documentAssetDirectory } from './documents';
import type { UIDocument } from '../src/shared/uiDocument';

export async function interfacePath(projectPath: string, target: unknown, library: 'project' | 'templates' = 'project') {
  if (!['project', 'templates'].includes(library)) throw new Error('不支持写入此 UI 资产库。');
  if (typeof target !== 'string' || !target || isAbsolute(target) || target.includes(':') || target.split(/[\\/]/).some(part => part === '..' || part === '' || part === '.')) throw new Error('必须使用 UI 资产库内的相对文件路径。');
  if (!target.toLowerCase().endsWith('.rbxui.json')) throw new Error('界面文件必须使用 .rbxui.json 扩展名。');
  const project = await realpath(projectPath), root = documentAssetDirectory(project, library);
  // Check existing ancestors before mkdir, including linked workspace/style directories.
  let ancestor = root;
  for (;;) {
    try { if (await realpath(ancestor) !== ancestor) throw new Error('UI 资产库不允许符号链接。'); break; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; ancestor = dirname(ancestor); }
  }
  await mkdir(root, { recursive: true });
  const canonicalRoot = await realpath(root);
  if (canonicalRoot !== root) throw new Error('UI 资产库不允许符号链接。');
  const file = resolve(root, target);
  if (relative(root, file).startsWith('..') || isAbsolute(relative(root, file))) throw new Error('路径超出工程。');
  let cursor = file;
  for (;;) {
    try {
      const actual = await realpath(cursor);
      if (actual !== cursor) throw new Error('界面路径不允许符号链接。');
      break;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; cursor = dirname(cursor); }
  }
  return file;
}
export async function fileVersion(path: string) { return createHash('sha256').update(await readFile(path)).digest('hex'); }
export async function saveInterface(projectPath: string, target: unknown, document: UIDocument, create: boolean, library: 'project' | 'templates' = 'project', expectedVersion?: string) {
  const file = await interfacePath(projectPath, target, library);
  if (!create && library === 'templates') {
    const current = await fileVersion(file).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (!expectedVersion || current !== expectedVersion) throw new Error('模板已被外部修改、移动或删除，请保留当前修改并重新打开模板。');
  }
  if (!create) { await stat(file); return { path: file, document: await writeDocument(file, document) }; }
  // Exclusive creation is necessary: checking existence before rename would overwrite a racing writer.
  const content = JSON.stringify(document, null, 2) + '\n';
  if (Buffer.byteLength(content) > 32 * 1024 * 1024) throw new Error('界面文件超过 32 MiB。');
  await mkdir(dirname(file), { recursive: true });
  const handle = await open(file, 'wx');
  try { await handle.writeFile(content, 'utf8'); }
  catch (error) { await handle.close(); await unlink(file).catch(() => {}); throw error; }
  await handle.close(); return { path: file, document };
}
export async function openInterface(projectPath: string, target: unknown, library: 'project' | 'templates' = 'project') {
  const path = await interfacePath(projectPath, target, library);
  const version = library === 'templates' ? await fileVersion(path) : undefined;
  const document = await readDocument(path);
  if (version && version !== await fileVersion(path)) throw new Error('模板读取期间发生变化，请重试。');
  return { path, document, version };
}
export async function listInterfaces(projectPath: string) {
  const project = await realpath(projectPath), root = join(project, 'interfaces');
  try { if (await realpath(root) !== root) throw new Error('interfaces 不允许符号链接。'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  const result: { name: string; relativePath: string }[] = [];
  async function visit(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.rbxui.json')) result.push({ name: entry.name.slice(0, -11), relativePath: relative(root, file).replaceAll('\\', '/') });
    }
  }
  await visit(root); return result.sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'zh-CN'));
}
