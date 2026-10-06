import type { Result } from './project';
import type { UIDocument, UINode } from './uiDocument';

export type ImageLibrary = 'permanent' | 'project';
export interface ImageAsset {
  id: string; platform: 'roblox'; library: ImageLibrary;
  name: string; tags: string; previewImage: NonNullable<UINode['previewImage']>;
  robloxId: string;
  usage: 'image' | 'tile' | 'placeholder';
}
export interface ImageAssetUpdate { id: string; name: string; tags: string; robloxId: string }
export interface ImageAssetAPI {
  list(): Promise<Result<ImageAsset[]>>;
  import(library: ImageLibrary): Promise<Result<ImageAsset | null>>;
  importFile(library: ImageLibrary, file: File): Promise<Result<ImageAsset>>;
  update(value: ImageAssetUpdate): Promise<Result<ImageAsset[]>>;
}
declare global { interface Window { imageAssets: ImageAssetAPI } }

export function normalizeRobloxId(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Roblox ID 必须是字符串。');
  const text = value.trim();
  if (!text) return '';
  const match = /^(?:rbxassetid:\/\/)?([1-9][0-9]*)$/.exec(text);
  if (!match || match[1].length > 20) throw new Error('Roblox ID 请填写正整数或 rbxassetid://正整数。');
  return `rbxassetid://${match[1]}`;
}
export function applyImageAsset(node: UINode, asset: ImageAsset, defaults = true): UINode {
  if (!['ImageLabel', 'ImageButton'].includes(node.className)) throw new Error('图片资产只能应用到 ImageLabel 或 ImageButton。');
  return { ...node, imageAssetId: asset.id, previewImage: { ...asset.previewImage }, properties: {
    ...node.properties, Image: asset.robloxId,
    ...(defaults ? { BackgroundTransparency: 1, ScaleType: asset.usage === 'tile' ? 'Tile' : 'Fit',
      ...(asset.usage === 'tile' ? { TileSize: { x: { scale: 0, offset: 27 }, y: { scale: 0, offset: 27 } } } : {}) } : {}),
  } };
}
export function resolveImageAssets(document: UIDocument, assets: ImageAsset[]): UIDocument {
  const index = new Map(assets.map(asset => [asset.id, asset]));
  const visit = (node: UINode): UINode => {
    const asset = node.imageAssetId ? index.get(node.imageAssetId) : undefined;
    const children = node.children.map(visit);
    const imageChanged = asset && (node.properties.Image !== asset.robloxId || node.previewImage?.name !== asset.previewImage.name || node.previewImage?.dataUrl !== asset.previewImage.dataUrl);
    if (!imageChanged && children.every((child, index) => child === node.children[index])) return node;
    return { ...(imageChanged ? applyImageAsset(node, asset, false) : node), children };
  };
  const root = visit(document.root);
  return root === document.root ? document : { ...document, root };
}
