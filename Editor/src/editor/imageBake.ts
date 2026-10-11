import { findNode, updateNode, type UIDocument, type UDim2, type UINode } from '../shared/uiDocument';
import { applyImageAsset, type ImageAsset } from '../shared/imageAssets';
import type { ProjectStrategy } from './strategy';
import { pixels } from './layout';

export type BakedNodeClass = 'ImageLabel' | 'ImageButton';
const retainedComponents = new Set(['UIScale', 'UISizeConstraint', 'UIAspectRatioConstraint']);

export function bakeSize(document: UIDocument, id: string, strategy: ProjectStrategy): { width: number; height: number } {
  function visit(parent: UINode, width: number, height: number): { width: number; height: number } | undefined {
    const rectangles = strategy.layout(parent, width, height);
    for (const child of parent.children) {
      const rect = rectangles.get(child.id);
      if (!rect) continue;
      if (child.id === id) return { width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) };
      const canvas = child.properties.CanvasSize as UDim2 | undefined;
      const found = visit(child, canvas ? Math.max(rect.width, pixels(canvas.x, rect.width)) : rect.width, canvas ? Math.max(rect.height, pixels(canvas.y, rect.height)) : rect.height);
      if (found) return found;
    }
  }
  const size = visit(document.root, document.canvas.width, document.canvas.height);
  if (!size) throw new Error('请选择可显示的节点进行烘焙。');
  return size;
}

export function convertToBakedImage(document: UIDocument, id: string, className: BakedNodeClass, asset: ImageAsset, strategy: ProjectStrategy): UIDocument {
  const original = findNode(document.root, id);
  if (!original || strategy.nodes[original.className].category !== 'object') throw new Error('请选择可显示的节点进行烘焙。');
  const replacement = strategy.createNode(className);
  for (const key of ['Position', 'Size', 'AnchorPoint', 'Rotation', 'Visible', 'ZIndex', 'LayoutOrder', 'ClipsDescendants']) {
    replacement.properties[key] = structuredClone(original.properties[key]);
  }
  replacement.id = original.id;
  replacement.name = original.name;
  replacement.children = original.children.filter(child => retainedComponents.has(child.className));
  const image = applyImageAsset(replacement, asset);
  image.properties.ScaleType = 'Stretch';
  return { ...document, root: updateNode(document.root, id, () => image) };
}
