import { mkdir, readFile, writeFile, rename, rm, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import builtins from '../src/assets/images/builtins.json';
import { normalizeRobloxId, type ImageAsset, type ImageAssetUpdate, type ImageLibrary } from '../src/shared/imageAssets';
import type { UINode } from '../src/shared/uiDocument';

interface Catalog { version: 2; assets: ImageAsset[] }
const empty = (): Catalog => ({ version: 2, assets: [] });
async function regular(path: string, directory = false) {
  const info = await lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (info && (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile()))) throw new Error('图片资产路径不能是链接或其他文件类型。');
  return info;
}
function validateAsset(value: unknown): ImageAsset {
  const a = value as ImageAsset;
  if (!a || typeof a !== 'object' || typeof a.id !== 'string' || !a.id || a.id.length > 160 || a.platform !== 'roblox' || !['permanent', 'project'].includes(a.library) || typeof a.name !== 'string' || !a.name.trim() || a.name.length > 100 || typeof a.tags !== 'string' || a.tags.length > 500 || !['image', 'tile', 'placeholder'].includes(a.usage)
    || !a.previewImage || typeof a.previewImage.name !== 'string' || typeof a.previewImage.dataUrl !== 'string' || a.previewImage.dataUrl.length > 14 * 1024 * 1024 || !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(a.previewImage.dataUrl)) throw new Error('图片资产记录无效。');
  return { id: a.id, platform: 'roblox', library: a.library, name: a.name.trim(), tags: a.tags.trim(), usage: a.usage,
    previewImage: { name: a.previewImage.name, dataUrl: a.previewImage.dataUrl }, robloxId: normalizeRobloxId(a.robloxId) };
}
export class ImageAssetStore {
  constructor(private runtime: string, private project?: string) {}
  private directory(library: ImageLibrary) {
    const root = library === 'permanent' ? this.runtime : this.project;
    if (!root) throw new Error('请先打开工程。');
    return join(root, 'image-assets');
  }
  async assetDirectory(id: string): Promise<string> {
    const asset = (await this.list()).find(a => a.id === id);
    if (!asset) throw new Error('图片资产不存在。');
    const directory = this.directory(asset.library);
    await regular(directory, true); await mkdir(directory, { recursive: true });
    return directory;
  }
  private async read(library: ImageLibrary): Promise<Catalog> {
    if (library === 'project' && !this.project) return empty();
    const directory = this.directory(library), path = join(directory, 'catalog.json');
    if (!await regular(directory, true)) return empty();
    const info = await regular(path);
    if (!info) return empty();
    if (info.size > 64 * 1024 * 1024) throw new Error('图片资产目录超过 64 MiB。');
    const value = JSON.parse(await readFile(path, 'utf8'));
    if (![1, 2].includes(value.version) || !Array.isArray(value.assets) || value.assets.length > 100) throw new Error('图片资产目录格式无效。');
    const assets = value.assets.map(validateAsset) as ImageAsset[];
    if (assets.some(a => a.library !== library) || new Set(assets.map(a => a.id)).size !== assets.length) throw new Error('图片资产库或 ID 无效。');
    return { version: 2, assets };
  }
  private async write(library: ImageLibrary, catalog: Catalog) {
    const directory = this.directory(library);
    await regular(directory, true); await mkdir(directory, { recursive: true });
    const path = join(directory, 'catalog.json'); await regular(path);
    const content = JSON.stringify(catalog, null, 2);
    if (Buffer.byteLength(content) > 64 * 1024 * 1024 || catalog.assets.length > 100) throw new Error('图片资产库最多 100 张、64 MiB。');
    const temp = join(directory, `${randomUUID()}.tmp`);
    try { await writeFile(temp, content, { flag: 'wx' }); await rename(temp, path); }
    finally { await rm(temp, { force: true }); }
  }
  async list(): Promise<ImageAsset[]> {
    const permanent = await this.read('permanent'), project = await this.read('project');
    const assets = new Map((builtins as ImageAsset[]).map(a => [a.id, validateAsset(a)]));
    for (const a of permanent.assets) assets.set(a.id, a);
    for (const a of project.assets) {
      if (assets.has(a.id)) throw new Error('图片资产 ID 重复。');
      assets.set(a.id, a);
    }
    return [...assets.values()];
  }
  async import(library: ImageLibrary, previewImage: NonNullable<UINode['previewImage']>): Promise<ImageAsset> {
    if (!['permanent', 'project'].includes(library)) throw new Error('图片资产库无效。');
    const asset = validateAsset({ id: randomUUID(), platform: 'roblox', library, name: previewImage.name.replace(/\.[^.]+$/, ''), tags: '', previewImage, robloxId: '', usage: 'image' });
    const catalog = await this.read(library); catalog.assets.push(asset); await this.write(library, catalog);
    return asset;
  }
  async update(input: ImageAssetUpdate): Promise<ImageAsset[]> {
    if (!input || typeof input.id !== 'string') throw new Error('图片资产配置无效。');
    const asset = (await this.list()).find(a => a.id === input.id);
    if (!asset) throw new Error('图片资产不存在。');
    const updated = validateAsset({ ...asset, name: input.name, tags: input.tags, robloxId: input.robloxId });
    const catalog = await this.read(asset.library);
    const index = catalog.assets.findIndex(a => a.id === asset.id);
    if (index < 0) catalog.assets.push(updated); else catalog.assets[index] = updated;
    await this.write(asset.library, catalog);
    return this.list();
  }
}
