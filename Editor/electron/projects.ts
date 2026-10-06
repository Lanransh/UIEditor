import { mkdir, readFile, writeFile, unlink, rmdir, rename, realpath } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WORKSPACE_DIRECTORY, type Project, type ProjectManifest, type RecentProject } from '../src/shared/project';

function code(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException)?.code;
}

export function describeError(error: unknown): string {
  switch (code(error)) {
    case 'EACCES': case 'EPERM': return '没有访问此位置的权限，请选择其他文件夹或检查文件权限。';
    case 'ENOENT': return '工程路径或 project.json 不存在，文件可能已被移动。请重新打开工程。';
    case 'ENOTDIR': return '所选路径不是有效的工程文件夹。';
    case 'ENOSPC': return '磁盘空间不足，无法保存。';
    default: return error instanceof Error ? error.message : '操作失败，请重试。';
  }
}

export function validateManifest(value: unknown): ProjectManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('工程文件结构无效。');
  const data = value as Record<string, unknown>;
  if (data.version !== 1) throw new Error('不支持此工程版本，当前仅支持版本 1。');
  if (data.mode !== 'roblox') throw new Error('不支持此工程模式，当前仅支持 Roblox。');
  if (typeof data.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.id)) throw new Error('工程 ID 无效。');
  if (typeof data.createdAt !== 'string' || !Number.isFinite(Date.parse(data.createdAt))) throw new Error('工程创建时间无效。');
  return { version: 1, id: data.id, mode: 'roblox', createdAt: data.createdAt };
}

export async function openProject(directory: string): Promise<Project> {
  if (basename(resolve(directory)).toLowerCase() !== WORKSPACE_DIRECTORY.toLowerCase()) throw new Error('请选择名为 UIEditorWorkspace 的工程目录。');
  const path = await realpath(directory);
  let value: unknown;
  const source = await readFile(join(path, 'project.json'), 'utf8');
  try { value = JSON.parse(source); } catch { throw new Error('project.json 已损坏，无法解析工程文件。'); }
  return { path, name: basename(dirname(path)) || dirname(path), manifest: validateManifest(value) };
}

export type CreateResult = { kind: 'created' | 'existing'; project: Project };

export async function createProject(parent: string): Promise<CreateResult> {
  const directory = join(await realpath(parent), WORKSPACE_DIRECTORY);
  try {
    await mkdir(directory);
  } catch (error) {
    if (code(error) !== 'EEXIST') throw error;
    try { return { kind: 'existing', project: await openProject(directory) }; }
    catch { throw new Error('UIEditorWorkspace 已存在，但不是有效工程。未修改其中的内容，请选择其他父文件夹。'); }
  }
  const manifest: ProjectManifest = { version: 1, id: randomUUID(), mode: 'roblox', createdAt: new Date().toISOString() };
  const file = join(directory, 'project.json');
  // Only remove a file after this operation has successfully created it.
  let fileCreated = false;
  try {
    const { open } = await import('node:fs/promises');
    const handle = await open(file, 'wx');
    fileCreated = true;
    try { await handle.writeFile(JSON.stringify(manifest, null, 2) + '\n', 'utf8'); }
    finally { await handle.close(); }
    return { kind: 'created', project: await openProject(directory) };
  } catch (error) {
    if (fileCreated) await unlink(file).catch(() => {});
    await rmdir(directory).catch(() => {});
    throw error;
  }
}

function pathKey(path: string): string {
  const normalized = resolve(path);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

export class RecentProjects {
  private file: string;
  constructor(private directory: string) { this.file = join(directory, 'recent-projects.json'); }

  async list(): Promise<RecentProject[]> {
    let source: string;
    try { source = await readFile(this.file, 'utf8'); }
    catch (error) { if (code(error) === 'ENOENT') return []; throw error; }
    let data: unknown;
    try { data = JSON.parse(source); } catch { throw new Error('最近工程记录已损坏，工程文件未受影响。'); }
    if (!Array.isArray(data) || !data.every(item => item && typeof item.path === 'string' && typeof item.lastOpenedAt === 'string' && Number.isFinite(Date.parse(item.lastOpenedAt)))) throw new Error('最近工程记录格式无效，工程文件未受影响。');
    return (data as RecentProject[]).sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
  }

  private async save(items: RecentProject[]): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const temporary = join(this.directory, `recent-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(items, null, 2) + '\n', { flag: 'wx' });
      await rename(temporary, this.file);
    } finally { await unlink(temporary).catch(() => {}); }
  }

  async record(path: string): Promise<void> {
    const items = (await this.list()).filter(item => pathKey(item.path) !== pathKey(path));
    items.unshift({ path, lastOpenedAt: new Date().toISOString() });
    await this.save(items);
  }

  async remove(path: string): Promise<RecentProject[]> {
    const items = (await this.list()).filter(item => pathKey(item.path) !== pathKey(path));
    await this.save(items);
    return items;
  }

  async resolveRecent(path: unknown): Promise<string> {
    if (typeof path !== 'string') throw new Error('工程路径无效。');
    const item = (await this.list()).find(item => pathKey(item.path) === pathKey(path));
    if (!item) throw new Error('最近列表中找不到此工程，请使用“打开工程”。');
    return item.path;
  }
}
