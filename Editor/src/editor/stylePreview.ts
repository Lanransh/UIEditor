import type { UIDocument } from '../shared/uiDocument';
import { robloxStrategy, isObject } from './roblox';

// Focus the visible top-level component surfaces, not the empty 1280×720 canvas.
export function stylePreviewBounds(document: UIDocument) {
  const rectangles = robloxStrategy.layout(document.root, 1280, 720);
  const bounds = document.root.properties.Enabled ? document.root.children.filter(node => isObject(node) && node.properties.Visible).map(node => {
    const rect = rectangles.get(node.id)!;
    const width = rect.width * rect.scale, height = rect.height * rect.scale;
    const angle = (node.properties.Rotation as number) * Math.PI / 180;
    const rotatedWidth = Math.abs(width * Math.cos(angle)) + Math.abs(height * Math.sin(angle));
    const rotatedHeight = Math.abs(width * Math.sin(angle)) + Math.abs(height * Math.cos(angle));
    return { x: rect.x + (width - rotatedWidth) / 2, y: rect.y + (height - rotatedHeight) / 2, width: rotatedWidth, height: rotatedHeight };
  }) : [];
  if (!bounds.length) return { x: 0, y: 0, width: 1280, height: 720 };
  const left = Math.min(...bounds.map(rect => rect.x)), top = Math.min(...bounds.map(rect => rect.y));
  const right = Math.max(...bounds.map(rect => rect.x + rect.width)), bottom = Math.max(...bounds.map(rect => rect.y + rect.height));
  return { x: left - 16, y: top - 16, width: Math.max(1, right - left) + 32, height: Math.max(1, bottom - top) + 32 };
}
