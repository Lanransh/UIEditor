import { relative } from 'node:path';
import { realpath } from 'node:fs/promises';
import type { Project } from '../src/shared/project';
import type { DocumentLibrary } from '../src/shared/documents';
import { integer } from '../src/shared/automation';
import { resolveImageAssets } from '../src/shared/imageAssets';
import { validateTarget, validateUUID } from '../src/shared/automation-tools';
import { openProject, RecentProjects, describeError } from './projects';
import { documentAssetDirectory, listDocumentAssets, readDocument } from './documents';
import { ImageAssetStore } from './image-assets';

// UUID lookup stays on the main-process side; queries never activate a project.
export class AutomationReader {
  constructor(private runtime: string, private recent: RecentProjects, private current: () => Project | null, private permanentImages?: string) {}
  private async projects() {
    const paths = new Set((await this.recent.list()).map(item => item.path));
    const current = this.current();
    if (current) paths.add(current.path);
    const projects: Project[] = [], problems: { name: string; problem: string }[] = [];
    const seen = new Set<string>();
    for (const path of paths) {
      try {
        const project = await openProject(path), key = project.path.toLowerCase();
        if (!seen.has(key)) { seen.add(key); projects.push(project); }
      } catch (error) { problems.push({ name: path, problem: describeError(error) }); }
    }
    return { projects, problems };
  }
  async listProjects() {
    const { projects, problems } = await this.projects();
    return { projects: projects.map(project => ({ projectId: project.manifest.id, name: project.name, current: project.path === this.current()?.path,
      ...(projects.filter(other => other.manifest.id.toLowerCase() === project.manifest.id.toLowerCase()).length > 1 ? { problem: '工程 UUID 重复，无法按 ID 定位。' } : {}) })), unavailable: problems };
  }
  async project(id?: unknown): Promise<Project> {
    if (id === undefined) {
      const current = this.current();
      if (!current) throw new Error('请先打开工程，或提供 projectId。');
      const project = await openProject(current.path);
      if (project.manifest.id !== current.manifest.id) throw new Error('当前工程身份已变化，请重新打开工程。');
      return project;
    }
    validateUUID(id);
    const matches = (await this.projects()).projects.filter(project => project.manifest.id.toLowerCase() === String(id).toLowerCase());
    if (matches.length > 1) throw new Error('工程 UUID 重复，无法按 ID 定位。');
    if (!matches.length) throw new Error('找不到此工程 UUID，请先在 App 中打开工程以登记位置。');
    return matches[0];
  }
  private async storage(projectId: unknown, library: unknown = 'project') {
    if (!['project', 'templates', 'permanent'].includes(String(library))) throw new Error('UI 资产库无效。');
    if (library === 'permanent' && projectId !== undefined) throw new Error('永久库不接受 projectId。');
    const project = library === 'permanent' ? null : await this.project(projectId);
    const location = project?.path ?? this.runtime;
    const root = await realpath(location).catch(error => { if (error.code === 'ENOENT') return location; throw error; });
    const directory = documentAssetDirectory(root, library as DocumentLibrary);
    const canonical = await realpath(directory).catch(error => { if (error.code === 'ENOENT') return directory; throw error; });
    if (canonical.toLowerCase() !== directory.toLowerCase()) throw new Error('UI 资产库不允许符号链接。');
    return { root, directory, library: library as DocumentLibrary, project };
  }
  private async documents(storage: Awaited<ReturnType<AutomationReader['storage']>>) {
    const entries: { name: string; path: string; documentId?: string; problem?: string }[] = [];
    for (const asset of await listDocumentAssets(storage.root, storage.library)) {
      try {
        const documentId = (await readDocument(asset.path)).id;
        validateUUID(documentId);
        entries.push({ ...asset, documentId });
      }
      catch (error) { entries.push({ ...asset, problem: describeError(error) }); }
    }
    for (const entry of entries) if (entry.documentId && entries.filter(other => other.documentId?.toLowerCase() === entry.documentId?.toLowerCase()).length > 1) entry.problem = '界面 UUID 重复，无法按 ID 定位。';
    return entries;
  }
  async listDocuments(args: Record<string, unknown>) {
    const storage = await this.storage(args.projectId, args.library);
    const entries = await this.documents(storage);
    const offset = integer(args.offset, 0, 0, 10000), limit = integer(args.limit, 50, 1, 200);
    return { projectId: storage.project?.manifest.id ?? null, library: storage.library,
      interfaces: entries.slice(offset, offset + limit).map(({ path, ...entry }) => ({ ...entry, relativePath: relative(storage.directory, path).replaceAll('\\', '/') })),
      total: entries.length, nextOffset: offset + limit < entries.length ? offset + limit : null };
  }
  async read(target: unknown) {
    validateTarget(target);
    const value = target as { projectId?: string; library?: DocumentLibrary; documentId: string };
    const storage = await this.storage(value.projectId, value.library);
    const entries = (await this.documents(storage)).filter(entry => entry.documentId?.toLowerCase() === value.documentId.toLowerCase());
    if (entries.length > 1) throw new Error('界面 UUID 重复，无法按 ID 定位。');
    if (!entries.length) throw new Error('指定库中找不到此界面 UUID。');
    // Recheck the UUID after reading, in case a saved file was replaced during lookup.
    const document = await readDocument(entries[0].path);
    if (document.id.toLowerCase() !== value.documentId.toLowerCase()) throw new Error('界面身份已变化，请重新列出界面。');
    const assets = await new ImageAssetStore(this.runtime, storage.project?.path, this.permanentImages).list();
    return { document: resolveImageAssets(document, assets.filter(asset => storage.project || asset.library === 'permanent')),
      target: { ...(storage.project ? { projectId: storage.project.manifest.id } : {}), library: storage.library, documentId: document.id } };
  }
  async images(args: Record<string, unknown>) {
    const project = args.library === 'permanent' ? null : await this.project(args.projectId);
    const assets = (await new ImageAssetStore(this.runtime, project?.path, this.permanentImages).list())
      .filter(asset => (args.library === undefined || args.library === asset.library) && (project || asset.library === 'permanent'));
    return { assets, projectId: project?.manifest.id ?? null };
  }
}
