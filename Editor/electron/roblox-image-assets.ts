import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { normalizeRobloxId, type ImageAsset, type ImageAssetUpdate } from '../src/shared/imageAssets';
import { readPreviewImage, safeFileName } from './documents';

interface Upload { ownerType: 'user' | 'group'; ownerId: string; assetId: string; sha256: string; uploadedAt?: string }
interface Metadata {
  schemaVersion: 1; id: string; kind: 'Image'; tags: string[]; uploads: Upload[];
  [key: string]: unknown;
}
interface Entry { path: string; meta: Metadata; asset: ImageAsset }
const imageExtension = /\.(png|jpe?g|webp|gif)$/i;
const hashPattern = /^[a-f0-9]{64}$/i;
const tagsOf = (tags: string) => [...new Set(tags.split(/[,，]/).map(tag => tag.trim()).filter(Boolean))];
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
async function regular(path: string, directory = false) {
  const info = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (info && (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile()))) throw new Error('图片资产路径不能是链接或其他文件类型。');
  return info;
}
function validateMeta(value: unknown): Metadata {
  const meta = value as Metadata;
  if (!meta || typeof meta !== 'object' || meta.schemaVersion !== 1 || typeof meta.id !== 'string' || !/^[a-f0-9]{32}$/i.test(meta.id)
    || meta.kind !== 'Image' || !Array.isArray(meta.tags) || meta.tags.some(tag => typeof tag !== 'string' || tag.length > 80)
    || !Array.isArray(meta.uploads) || meta.uploads.some(upload => !upload || !['user', 'group'].includes(upload.ownerType)
      || typeof upload.ownerId !== 'string' || !/^[1-9]\d*$/.test(upload.ownerId)
      || typeof upload.assetId !== 'string' || !/^[1-9]\d{0,19}$/.test(upload.assetId) || typeof upload.sha256 !== 'string' || !hashPattern.test(upload.sha256))) throw new Error('图片 meta 格式无效。');
  return meta;
}
async function writeMeta(path: string, meta: Metadata) {
  await regular(path);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(validateMeta(meta), null, 2) + '\n', { flag: 'wx' });
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
}

export class RobloxImageAssetStore {
  readonly root: string;
  constructor(private project: string) { this.root = join(dirname(resolve(project)), 'ArtSource', 'UI'); }
  private async checkRoot() {
    await regular(dirname(dirname(this.root)), true);
    await regular(dirname(this.root), true);
    return regular(this.root, true);
  }
  private async owner(): Promise<{ ownerType: 'user' | 'group'; ownerId: string } | undefined> {
    const directory = join(dirname(resolve(this.project)), 'GameKitWorkspace');
    if (!await regular(directory, true)) return;
    const path = join(directory, 'setting.json');
    const info = await regular(path);
    if (!info) return;
    if (info.size > 1024 * 1024) throw new Error('工程资源上传设置过大。');
    const settings = JSON.parse(await readFile(path, 'utf8'));
    const ownerId = String(settings.robloxOwnerId ?? '');
    if (['user', 'group'].includes(settings.robloxOwnerType) && /^[1-9]\d*$/.test(ownerId)) return { ownerType: settings.robloxOwnerType, ownerId };
  }
  private async entries(): Promise<Entry[]> {
    if (!await this.checkRoot()) return [];
    const owner = await this.owner();
    const entries: Entry[] = [];
    const visit = async (directory: string) => {
      for (const item of await readdir(directory, { withFileTypes: true })) {
        if (item.name.startsWith('.')) continue;
        const path = join(directory, item.name);
        if (item.isSymbolicLink()) throw new Error('图片资产目录不能包含链接。');
        if (item.isDirectory()) { await regular(path, true); await visit(path); }
        else if (imageExtension.test(item.name)) {
          await regular(path);
          const previewImage = await readPreviewImage(path);
          const hash = sha256(Buffer.from(previewImage.dataUrl.split(',')[1], 'base64'));
          const metaPath = `${path}.meta`;
          const info = await regular(metaPath);
          let meta: Metadata;
          if (info) {
            if (info.size > 1024 * 1024) throw new Error('图片 meta 超过 1 MiB。');
            meta = validateMeta(JSON.parse(await readFile(metaPath, 'utf8')));
          } else {
            meta = { schemaVersion: 1, id: randomUUID().replaceAll('-', ''), kind: 'Image', tags: [], uploads: [] };
            await writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n', { flag: 'wx' });
          }
          const upload = previewImage.dataUrl.startsWith('data:image/png;') && owner
            ? [...meta.uploads].reverse().find(upload => upload.ownerType === owner.ownerType && upload.ownerId === owner.ownerId && upload.sha256 === hash) : undefined;
          const asset: ImageAsset = {
            id: meta.id, platform: 'roblox', library: 'project', name: basename(path, extname(path)),
            tags: meta.tags.join(', '), usage: 'image', previewImage,
            robloxId: upload ? normalizeRobloxId(upload.assetId) : '',
          };
          entries.push({ path, meta, asset });
          if (entries.length > 100) throw new Error('图片资产库最多 100 张。');
        }
      }
    };
    await visit(this.root);
    if (Buffer.byteLength(JSON.stringify(entries.map(entry => entry.asset))) > 64 * 1024 * 1024) throw new Error('图片资产库最多 64 MiB。');
    if (new Set(entries.map(entry => entry.asset.id)).size !== entries.length) throw new Error('图片资产 ID 重复。');
    return entries.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));
  }
  async list(): Promise<ImageAsset[]> { return (await this.entries()).map(entry => entry.asset); }
  async directory(id: string): Promise<string> {
    const entry = (await this.entries()).find(entry => entry.asset.id === id);
    if (!entry) throw new Error('图片资产不存在。');
    return dirname(entry.path);
  }
  async import(asset: ImageAsset): Promise<ImageAsset> {
    await this.checkRoot();
    const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(asset.previewImage.dataUrl);
    if (!match) throw new Error('图片预览格式无效。');
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > 8 * 1024 * 1024) throw new Error('图片不能超过 8 MiB。');
    const existing = await this.entries();
    if (existing.some(entry => entry.asset.id === asset.id)) throw new Error('图片资产 ID 重复。');
    if (existing.length >= 100 || Buffer.byteLength(JSON.stringify([...existing.map(entry => entry.asset), asset])) > 64 * 1024 * 1024) throw new Error('图片资产库最多 100 张、64 MiB。');
    await mkdir(this.root, { recursive: true });
    const filename = safeFileName(basename(asset.previewImage.name));
    const extension = imageExtension.test(filename) ? extname(filename) : `.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
    const stem = imageExtension.test(filename) ? basename(filename, extension) : filename;
    let path = join(this.root, `${stem}${extension}`);
    for (let suffix = 2; await regular(path) || await regular(`${path}.meta`); suffix++) path = join(this.root, `${stem}-${suffix}${extension}`);
    await writeFile(path, bytes, { flag: 'wx' });
    try {
      await readPreviewImage(path);
      const tags = tagsOf(asset.tags);
      await writeMeta(`${path}.meta`, {
        schemaVersion: 1, id: asset.id, kind: 'Image', tags, uploads: [],
      });
      return { ...asset, name: basename(path, extname(path)), tags: tags.join(', '), usage: 'image',
        previewImage: { ...asset.previewImage, name: basename(path) }, robloxId: '' };
    } catch (error) { await rm(path, { force: true }); throw error; }
  }
  async patch(id: string, changes: Partial<Omit<ImageAssetUpdate, 'id'>>): Promise<void> {
    const entry = (await this.entries()).find(entry => entry.asset.id === id);
    if (!entry) throw new Error('图片资产不存在。');
    if (changes.tags !== undefined) {
      const tags = tagsOf(changes.tags.trim());
      if (tags.length > 50 || tags.some(tag => tag.length > 80)) throw new Error('最多 50 个标签，每个标签为 1 到 80 字符。');
      entry.meta.tags = tags;
    }
    if (changes.robloxId !== undefined && normalizeRobloxId(changes.robloxId) !== entry.asset.robloxId) {
      const owner = await this.owner();
      if (!owner) throw new Error('请先在 Toolkit 工程设置中配置资源所有者。');
      if (!entry.asset.previewImage.dataUrl.startsWith('data:image/png;')) throw new Error('非 PNG 图片的转换哈希请通过 Toolkit 资产管理器维护。');
      const robloxId = normalizeRobloxId(changes.robloxId);
      const hash = sha256(Buffer.from(entry.asset.previewImage.dataUrl.split(',')[1], 'base64'));
      if (robloxId) entry.meta.uploads.push({ ...owner, assetId: robloxId.slice('rbxassetid://'.length), sha256: hash, uploadedAt: new Date().toISOString() });
      else entry.meta.uploads = entry.meta.uploads.filter(upload => upload.ownerType !== owner.ownerType || upload.ownerId !== owner.ownerId || upload.sha256 !== hash);
    }
    let target = entry.path;
    if (changes.name !== undefined && changes.name.trim() !== entry.asset.name) {
      const name = changes.name.trim();
      if (name !== safeFileName(name)) throw new Error('图片名称不能包含路径或特殊字符。');
      target = join(dirname(entry.path), name + extname(entry.path));
      if (target.toLowerCase() !== entry.path.toLowerCase() && (await regular(target) || await regular(`${target}.meta`))) throw new Error('目标目录已有同名图片。');
    }
    // Save before moving so a failed metadata write cannot leave a partial rename.
    await writeMeta(`${entry.path}.meta`, entry.meta);
    if (target !== entry.path) {
      await rename(entry.path, target);
      try { await rename(`${entry.path}.meta`, `${target}.meta`); }
      catch (error) { await rename(target, entry.path); throw error; }
    }
  }
}
