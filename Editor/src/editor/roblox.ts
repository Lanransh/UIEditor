import { dim, dim2, emptyScripts, type UIDocument, type UINode, type Vector2 } from '../shared/uiDocument';
import { validateScripts } from '../shared/runtime';
import type { NodeDefinition, PreviewRect, ProjectStrategy, PropertyDefinition } from './strategy';
import { layoutChildren } from './layout';
import { robloxAutomation } from './automationCapabilities';

const number = (value: number, min?: number, max?: number, integer = false): PropertyDefinition => ({ kind: 'number', value, min, max, integer });
const string = (value: string): PropertyDefinition => ({ kind: 'string', value });
const bool = (value: boolean): PropertyDefinition => ({ kind: 'boolean', value });
const color = (value: string): PropertyDefinition => ({ kind: 'color', value });
const enumeration = (value: string, choices: string[]): PropertyDefinition => ({ kind: 'enum', value, choices });
const dimension = (offset = 0): PropertyDefinition => ({ kind: 'udim', value: dim(0, offset) });
const dimensions = (width: number, height: number): PropertyDefinition => ({ kind: 'udim2', value: dim2(width, height) });
const vector = (x: number, y: number, min?: number, max?: number): PropertyDefinition => ({ kind: 'vector', value: { x, y }, min, max });
const common = {
  Position: dimensions(0, 0), Size: dimensions(200, 100), AnchorPoint: vector(0, 0, 0, 1),
  Rotation: number(0), Visible: bool(true), ZIndex: number(1, undefined, undefined, true), LayoutOrder: number(0, undefined, undefined, true),
  BackgroundColor3: color('#ffffff'), BackgroundTransparency: number(0, 0, 1), ClipsDescendants: bool(false),
};
const text = {
  Text: string('文字'), TextColor3: color('#263a3a'), TextSize: number(24, 1, 100), TextTransparency: number(0, 0, 1),
  Font: enumeration('SourceSans', ['SourceSans', 'Arial', 'Gotham', 'GothamBold']), TextWrapped: bool(true), TextScaled: bool(false),
  TextXAlignment: enumeration('Center', ['Left', 'Center', 'Right']), TextYAlignment: enumeration('Center', ['Top', 'Center', 'Bottom']),
};
const image = { Image: string(''), ImageColor3: color('#ffffff'), ImageTransparency: number(0, 0, 1), ScaleType: enumeration('Fit', ['Fit', 'Stretch', 'Crop', 'Tile']), TileSize: { kind: 'udim2', value: { x: dim(1, 0), y: dim(1, 0) } } as PropertyDefinition };
const alignment = {
  FillDirection: enumeration('Vertical', ['Vertical', 'Horizontal']), SortOrder: enumeration('LayoutOrder', ['LayoutOrder', 'Name']),
  HorizontalAlignment: enumeration('Left', ['Left', 'Center', 'Right']), VerticalAlignment: enumeration('Top', ['Top', 'Center', 'Bottom']),
};
const object = (properties = {}): NodeDefinition => ({ category: 'object', properties: { ...common, ...properties } });
const component = (properties: NodeDefinition['properties']): NodeDefinition => ({ category: 'component', properties });
export const nodeDefinitions: Record<string, NodeDefinition> = {
  ScreenGui: { category: 'root', properties: { Enabled: bool(true), DisplayOrder: number(0, undefined, undefined, true) } },
  Frame: object(),
  ScrollingFrame: object({ CanvasSize: dimensions(400, 400), CanvasPosition: vector(0, 0, 0), ScrollBarThickness: number(8, 0, 100), ScrollingDirection: enumeration('XY', ['X', 'Y', 'XY']) }),
  CanvasGroup: object({ GroupTransparency: number(0, 0, 1), GroupColor3: color('#ffffff') }),
  TextLabel: object(text), TextButton: object({ ...text, Text: string('按钮') }), TextBox: object({ ...text, PlaceholderText: string('输入文字') }),
  ImageLabel: object(image), ImageButton: object(image),
  UICorner: component({ CornerRadius: dimension(8) }),
  UIStroke: component({ Color: color('#263a3a'), Thickness: number(1, 0, 100), Transparency: number(0, 0, 1), Enabled: bool(true) }),
  UIGradient: component({ ColorStart: color('#ffffff'), ColorEnd: color('#168b85'), TransparencyStart: number(0, 0, 1), TransparencyEnd: number(0, 0, 1), Rotation: number(0), Enabled: bool(true) }),
  UIPadding: component({ PaddingLeft: dimension(), PaddingRight: dimension(), PaddingTop: dimension(), PaddingBottom: dimension() }),
  UIScale: component({ Scale: number(1, .01, 100) }),
  UIListLayout: component({ ...alignment, Padding: dimension(8) }),
  UIGridLayout: component({ ...alignment, FillDirection: enumeration('Horizontal', ['Horizontal', 'Vertical']), CellSize: dimensions(100, 100), CellPadding: dimensions(8, 8), FillDirectionMaxCells: number(0, 0, 10000, true) }),
  UIAspectRatioConstraint: component({ AspectRatio: number(1, .001, 1000), DominantAxis: enumeration('Width', ['Width', 'Height']) }),
  UISizeConstraint: component({ MinSize: vector(0, 0, 0), MaxSize: vector(10000, 10000, 0) }),
  UITextSizeConstraint: component({ MinTextSize: number(1, 1, 100), MaxTextSize: number(100, 1, 100) }),
};

function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function exact(value: unknown, keys: string[]): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).every(key => keys.includes(key)) && keys.every(key => Object.hasOwn(value, key));
}
function finite(value: unknown, min?: number, max?: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && (min === undefined || value >= min) && (max === undefined || value <= max);
}
export function validProperty(value: unknown, definition: PropertyDefinition): boolean {
  switch (definition.kind) {
    case 'number': return finite(value, definition.min, definition.max) && (!definition.integer || Number.isInteger(value));
    case 'boolean': return typeof value === 'boolean';
    case 'string': return typeof value === 'string';
    case 'color': return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
    case 'enum': return typeof value === 'string' && !!definition.choices?.includes(value);
    case 'vector': return exact(value, ['x', 'y']) && finite(value.x, definition.min, definition.max) && finite(value.y, definition.min, definition.max);
    case 'udim': return exact(value, ['scale', 'offset']) && finite(value.scale) && finite(value.offset) && Number.isInteger(value.offset);
    case 'udim2': return exact(value, ['x', 'y']) && validProperty(value.x, dimension()) && validProperty(value.y, dimension());
  }
}
export function isObject(node: UINode): boolean { return nodeDefinitions[node.className]?.category === 'object'; }
export function layoutComponent(node: UINode) { return node.children.find(child => ['UIListLayout', 'UIGridLayout'].includes(child.className)); }
export function auxiliary(node: UINode, className: string) { return node.children.find(child => child.className === className); }

export class RobloxProjectStrategy implements ProjectStrategy {
  readonly automation = robloxAutomation;
  readonly mode = 'roblox' as const;
  readonly nodes = nodeDefinitions;
  createNode(className: string): UINode {
    const definition = this.nodes[className];
    if (!Object.hasOwn(this.nodes, className)) throw new Error(`不支持节点类型 ${className}`);
    return { id: crypto.randomUUID(), className, name: className, properties: Object.fromEntries(Object.entries(definition.properties).map(([key, property]) => [key, structuredClone(property.value)])), children: [] };
  }
  createDocument(name = 'Untitled'): UIDocument {
    return { format: 'roblox-ui', version: 3, id: crypto.randomUUID(), name: name.trim(), canvas: { width: 1280, height: 720 }, root: this.createNode('ScreenGui'), scripts: emptyScripts(name) };
  }
  canParent(parent: UINode, child: UINode, excludingId?: string) {
    if (!Object.hasOwn(this.nodes, parent.className) || !Object.hasOwn(this.nodes, child.className) || child.className === 'ScreenGui' || this.nodes[parent.className].category === 'component') return false;
    if (this.nodes[child.className].category === 'component') {
      if (parent.className === 'ScreenGui') return false;
      if (child.className === 'UITextSizeConstraint' && !parent.className.startsWith('Text')) return false;
      return !parent.children.some(sibling => sibling.id !== excludingId && (sibling.className === child.className || (['UIListLayout', 'UIGridLayout'].includes(child.className) && ['UIListLayout', 'UIGridLayout'].includes(sibling.className))));
    }
    return true;
  }
  validate(source: unknown): UIDocument {
    if (!isRecord(source)) throw new Error('界面格式或版本不支持。');
    source = structuredClone(source);
    if (!exact(source, ['format', 'version', 'id', 'name', 'canvas', 'root', 'scripts']) || source.format !== 'roblox-ui' || ![2, 3].includes(source.version as number)) throw new Error('界面格式或版本不支持。');
    if (typeof source.id !== 'string' || !source.id.trim() || typeof source.name !== 'string' || !source.name.trim() || !exact(source.canvas, ['width', 'height']) || source.canvas.width !== 1280 || source.canvas.height !== 720) throw new Error('界面名称、ID 或画布尺寸无效。');
    const ids = new Set<string>();
    let count = 0;
    const check = (value: unknown, depth: number): UINode => {
      if (++count > 5000 || depth > 64) throw new Error('界面最多支持 5000 个节点、64 层。');
      if (!isRecord(value) || Object.keys(value).some(key => !['id', 'name', 'className', 'properties', 'children', 'previewImage', 'imageAssetId'].includes(key)) || typeof value.id !== 'string' || !value.id.trim() || ids.has(value.id) || typeof value.name !== 'string' || !value.name.trim() || typeof value.className !== 'string' || !Object.hasOwn(this.nodes, value.className) || !Array.isArray(value.children)) throw new Error('节点类型、名称、ID 或层级无效（ID 不可重复）。');
      if (Object.hasOwn(value, 'imageAssetId') && (!value.className.startsWith('Image') || typeof value.imageAssetId !== 'string' || !value.imageAssetId.trim() || value.imageAssetId.length > 160)) throw new Error('图片资产引用无效。');
      ids.add(value.id);
      const definition = this.nodes[value.className];
      if (value.className.startsWith('Image') && isRecord(value.properties) && !Object.hasOwn(value.properties, 'TileSize')) value.properties.TileSize = structuredClone(image.TileSize.value);
      if (value.className === 'ScrollingFrame' && isRecord(value.properties) && !Object.hasOwn(value.properties, 'ScrollingDirection')) value.properties.ScrollingDirection = definition.properties.ScrollingDirection.value;
      if (!exact(value.properties, Object.keys(definition.properties))) throw new Error(`${value.name} 存在缺失或不支持的属性。`);
      for (const [key, property] of Object.entries(definition.properties)) if (!validProperty(value.properties[key], property)) {
        const detail = ['udim', 'udim2'].includes(property.kind) ? ' Scale 必须是有限数字，Offset 必须是整数。' : '';
        throw new Error(`${value.name}.${key} 属性值无效。${detail}`);
      }
      const p = value.properties;
      if (value.className === 'UISizeConstraint' && ((p.MinSize as Vector2).x > (p.MaxSize as Vector2).x || (p.MinSize as Vector2).y > (p.MaxSize as Vector2).y)) throw new Error('最小尺寸不能大于最大尺寸。');
      if (value.className === 'UITextSizeConstraint' && (p.MinTextSize as number) > (p.MaxTextSize as number)) throw new Error('最小字号不能大于最大字号。');
      if (isRecord(value.previewImage) || Object.hasOwn(value, 'previewImage')) {
        const preview = value.previewImage;
        if (!value.className.startsWith('Image') || !exact(preview, ['name', 'dataUrl']) || typeof preview.name !== 'string' || typeof preview.dataUrl !== 'string' || preview.dataUrl.length > 14 * 1024 * 1024 || !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(preview.dataUrl)) throw new Error('本地预览图片无效，仅支持 PNG/JPEG/WebP/GIF。');
      }
      const node = value as unknown as UINode;
      if (definition.category === 'component' && node.children.length) throw new Error('辅助节点不能包含子节点。');
      node.children.forEach(child => {
        check(child, depth + 1);
        if (!this.canParent(node, child, child.id)) throw new Error(`${node.name} 不允许包含 ${child.className}，或辅助节点重复。`);
      });
      return node;
    };
    const root = check(source.root, 0);
    if (root.className !== 'ScreenGui') throw new Error('根节点必须是 ScreenGui。');
    const scripts = validateScripts(source.scripts, source.version === 2);
    return structuredClone({ ...source, version: 3, scripts }) as unknown as UIDocument;
  }
  layout(parent: UINode, width: number, height: number): Map<string, PreviewRect> { return layoutChildren(parent, width, height); }
}
export const robloxStrategy = new RobloxProjectStrategy();
export function projectStrategy(mode: 'roblox'): ProjectStrategy { if (mode === 'roblox') return robloxStrategy; throw new Error('不支持的工程模式'); }
