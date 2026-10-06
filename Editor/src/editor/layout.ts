import type { UDim, UDim2, UINode, Vector2 } from '../shared/uiDocument';
import type { PreviewRect } from './strategy';
import { auxiliary, isObject, layoutComponent } from './roblox';

export const pixels = (value: UDim, total: number) => value.scale * total + value.offset;
const align = (value: unknown) => value === 'Center' ? .5 : value === 'Right' || value === 'Bottom' ? 1 : 0;
export function constrainedSize(node: UINode, width: number, height: number) {
  const ratio = auxiliary(node, 'UIAspectRatioConstraint')?.properties;
  if (ratio) {
    // Roblox's default AspectType is FitWithinMaxSize.
    width = Math.min(width, height * (ratio.AspectRatio as number));
    height = width / (ratio.AspectRatio as number);
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
    const cells = visible.map(child => {
      const limit = auxiliary(child, 'UISizeConstraint')?.properties;
      const min = limit?.MinSize as Vector2 | undefined, max = limit?.MaxSize as Vector2 | undefined;
      // Grid constraints replace the whole cell size with the violating bound.
      const size = min && (min.x > cw || min.y > ch) ? { width: min.x, height: min.y }
        : max && (max.x < cw || max.y < ch) ? { width: max.x, height: max.y } : { width: cw, height: ch };
      const cols = Math.max(1, Math.ceil(((min?.x ?? 0) + gx) / Math.max(1, cw + gx)));
      const rows = Math.max(1, Math.ceil(((min?.y ?? 0) + gy) / Math.max(1, ch + gy)));
      return { child, size: constrainedSize(child, size.width, size.height), cols, rows, col: 0, row: 0 };
    });
    const count = Math.max(Math.min(max || fit, fit, Math.max(1, visible.length)), ...cells.map(c => horizontal ? c.cols : c.rows));
    let major = 0, minor = 0;
    const placed: typeof cells = [];
    for (const cell of cells) {
      const span = horizontal ? cell.cols : cell.rows;
      while (true) {
        if (major + span > count) { major = 0; minor++; }
        cell.col = horizontal ? major : minor; cell.row = horizontal ? minor : major;
        const blocked = placed.find(c => cell.col < c.col + c.cols && cell.col + cell.cols > c.col && cell.row < c.row + c.rows && cell.row + cell.rows > c.row);
        if (!blocked) break;
        if ((horizontal ? blocked.cols : blocked.rows) === count) { major = 0; minor = (horizontal ? blocked.row + blocked.rows : blocked.col + blocked.cols); }
        else major = horizontal ? blocked.col + blocked.cols : blocked.row + blocked.rows;
      }
      placed.push(cell); major += span;
    }
    const rows = Math.max(0, ...cells.map(c => c.row + c.rows));
    const cols = Math.max(0, ...cells.map(c => c.col + c.cols));
    const originX = left + (innerWidth - cols * cw - Math.max(0, cols - 1) * gx) * align(p.HorizontalAlignment);
    const originY = top + (innerHeight - rows * ch - Math.max(0, rows - 1) * gy) * align(p.VerticalAlignment);
    cells.forEach(cell => {
      const rect = result.get(cell.child.id)!;
      Object.assign(rect, cell.size, {
        x: originX + cell.col * (cw + gx) + (cell.cols * cw + (cell.cols - 1) * gx - cell.size.width * rect.scale) / 2,
        y: originY + cell.row * (ch + gy) + (cell.rows * ch + (cell.rows - 1) * gy - cell.size.height * rect.scale) / 2,
      });
    });
  }
  return result;
}
