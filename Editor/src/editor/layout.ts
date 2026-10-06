import type { UDim, UDim2, UINode, Vector2 } from '../shared/uiDocument';
import type { PreviewRect } from './strategy';
import { auxiliary, isObject, layoutComponent } from './roblox';

export const pixels = (value: UDim, total: number) => value.scale * total + value.offset;
const align = (value: unknown) => value === 'Center' ? .5 : value === 'Right' || value === 'Bottom' ? 1 : 0;
export function constrainedSize(node: UINode, width: number, height: number) {
  const ratio = auxiliary(node, 'UIAspectRatioConstraint')?.properties;
  if (ratio) {
    if (ratio.DominantAxis === 'Height') width = height * (ratio.AspectRatio as number);
    else height = width / (ratio.AspectRatio as number);
  }
  const limit = auxiliary(node, 'UISizeConstraint')?.properties;
  if (limit) {
    const min = limit.MinSize as Vector2, max = limit.MaxSize as Vector2;
    width = Math.min(max.x, Math.max(min.x, width)); height = Math.min(max.y, Math.max(min.y, height));
  }
  return { width: Math.max(0, width), height: Math.max(0, height) };
}
export function layoutChildren(parent: UINode, width: number, height: number): Map<string, PreviewRect> {
  const padding = auxiliary(parent, 'UIPadding')?.properties;
  const left = padding ? pixels(padding.PaddingLeft as UDim, width) : 0;
  const right = padding ? pixels(padding.PaddingRight as UDim, width) : 0;
  const top = padding ? pixels(padding.PaddingTop as UDim, height) : 0;
  const bottom = padding ? pixels(padding.PaddingBottom as UDim, height) : 0;
  const innerWidth = Math.max(0, width - left - right), innerHeight = Math.max(0, height - top - bottom);
  const result = new Map<string, PreviewRect>();
  const children = parent.children.filter(isObject);
  for (const child of children) {
    const size = child.properties.Size as UDim2, position = child.properties.Position as UDim2, anchor = child.properties.AnchorPoint as Vector2;
    const actual = constrainedSize(child, pixels(size.x, innerWidth), pixels(size.y, innerHeight));
    const scale = (auxiliary(child, 'UIScale')?.properties.Scale as number | undefined) ?? 1;
    result.set(child.id, { ...actual, scale, x: left + pixels(position.x, innerWidth) - actual.width * scale * anchor.x, y: top + pixels(position.y, innerHeight) - actual.height * scale * anchor.y });
  }
  const layout = layoutComponent(parent);
  if (!layout) return result;
  const p = layout.properties;
  const visible = children.filter(child => child.properties.Visible).sort((a, b) => p.SortOrder === 'Name' ? a.name.localeCompare(b.name) : (a.properties.LayoutOrder as number) - (b.properties.LayoutOrder as number));
  const horizontal = p.FillDirection === 'Horizontal';
  if (layout.className === 'UIListLayout') {
    const gap = pixels(p.Padding as UDim, horizontal ? innerWidth : innerHeight);
    const length = visible.reduce((sum, child) => { const rect = result.get(child.id)!; return sum + (horizontal ? rect.width : rect.height) * rect.scale; }, 0) + gap * Math.max(0, visible.length - 1);
    let cursor = (horizontal ? left : top) + ((horizontal ? innerWidth : innerHeight) - length) * align(horizontal ? p.HorizontalAlignment : p.VerticalAlignment);
    for (const child of visible) {
      const rect = result.get(child.id)!;
      rect.x = horizontal ? cursor : left + (innerWidth - rect.width * rect.scale) * align(p.HorizontalAlignment);
      rect.y = horizontal ? top + (innerHeight - rect.height * rect.scale) * align(p.VerticalAlignment) : cursor;
      cursor += (horizontal ? rect.width : rect.height) * rect.scale + gap;
    }
  } else {
    const cell = p.CellSize as UDim2, spacing = p.CellPadding as UDim2;
    const cw = Math.max(1, pixels(cell.x, innerWidth)), ch = Math.max(1, pixels(cell.y, innerHeight));
    const gx = pixels(spacing.x, innerWidth), gy = pixels(spacing.y, innerHeight);
    const fit = Math.max(1, Math.floor(((horizontal ? innerWidth : innerHeight) + (horizontal ? gx : gy)) / Math.max(1, (horizontal ? cw + gx : ch + gy))));
    const max = p.FillDirectionMaxCells as number;
    const count = Math.min(max || fit, fit, Math.max(1, visible.length));
    const rows = horizontal ? Math.ceil(visible.length / count) : count;
    const cols = horizontal ? count : Math.ceil(visible.length / count);
    const originX = left + (innerWidth - cols * cw - Math.max(0, cols - 1) * gx) * align(p.HorizontalAlignment);
    const originY = top + (innerHeight - rows * ch - Math.max(0, rows - 1) * gy) * align(p.VerticalAlignment);
    visible.forEach((child, i) => {
      const rect = result.get(child.id)!;
      Object.assign(rect, constrainedSize(child, cw, ch), { x: originX + (horizontal ? i % count : Math.floor(i / count)) * (cw + gx), y: originY + (horizontal ? Math.floor(i / count) : i % count) * (ch + gy) });
    });
  }
  return result;
}
