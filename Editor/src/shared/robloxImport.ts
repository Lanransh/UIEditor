import { nodeDefinitions, robloxStrategy } from '../editor/roblox';
import type { JSONValue, PropertyValue, UDim, UDim2, UINode, Vector2 } from './uiDocument';

export interface RobloxImportPackage {
  format: 'ui-editor-import'; version: 1; documentId: string;
  model: RobloxModel; scripts: { source: string };
}
export interface RobloxModel {
  name: string; className: string; properties: Record<string, JSONValue>;
  attributes: Record<string, JSONValue>; children: RobloxModel[];
}
const rgb = (value: string) => [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16) / 255);
function udim(value: UDim, path: string): number[] {
  if (!Number.isInteger(value.offset)) throw new Error(`${path} 的 Offset 必须是整数，无法无损导入 Roblox。`);
  return [value.scale, value.offset];
}
function convert(value: PropertyValue, kind: string, path: string): JSONValue {
  if (kind === 'color') return { Color3: rgb(value as string) };
  if (kind === 'vector') { const vector = value as Vector2; return { Vector2: [vector.x, vector.y] }; }
  if (kind === 'udim') return { UDim: udim(value as UDim, path) };
  if (kind === 'udim2') { const size = value as UDim2; return { UDim2: [udim(size.x, path), udim(size.y, path)] }; }
  return value as JSONValue;
}
export function createRobloxImportPackage(source: unknown): RobloxImportPackage {
  const document = robloxStrategy.validate(source);
  function build(node: UINode, path: string): RobloxModel {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(node.name)) throw new Error(`${path}：导入节点名只支持英文、数字和下划线，且须以字母开头。`);
    if (new Set(node.children.map(child => child.name)).size !== node.children.length) throw new Error(`${path} 存在同名子节点，脚本路径有歧义。`);
    if (node.className.startsWith('Image') && node.previewImage && !node.properties.Image) throw new Error(`${path} 只有本地预览图，请先配置 Roblox 资源 ID。`);
    if (node.className.startsWith('Image') && node.properties.Image && !/^rbxassetid:\/\/[1-9][0-9]*$/.test(String(node.properties.Image))) throw new Error(`${path} 的图片必须使用 rbxassetid:// 资源 ID。`);
    const properties: Record<string, JSONValue> = {};
    for (const [key, value] of Object.entries(node.properties)) {
      if (node.className === 'UIGradient' && /^(Color|Transparency)(Start|End)$/.test(key)) continue;
      properties[key] = convert(value, nodeDefinitions[node.className].properties[key].kind, `${path}.${key}`);
    }
    if (node.className === 'UIGradient') {
      properties.Color = { ColorSequence: { keypoints: [
        { time: 0, color: rgb(node.properties.ColorStart as string) }, { time: 1, color: rgb(node.properties.ColorEnd as string) },
      ] } };
      properties.Transparency = { NumberSequence: { keypoints: [
        { time: 0, value: node.properties.TransparencyStart as number, envelope: 0 },
        { time: 1, value: node.properties.TransparencyEnd as number, envelope: 0 },
      ] } };
    }
    if (nodeDefinitions[node.className].category === 'object') properties.BorderSizePixel = 0;
    if (node.className === 'ScreenGui') { properties.IgnoreGuiInset = true; properties.ResetOnSpawn = false; }
    return { name: node.name, className: node.className, properties,
      attributes: { UIEditorNodeId: { String: node.id } }, children: node.children.map(child => build(child, `${path}.${child.name}`)) };
  }
  return { format: 'ui-editor-import', version: 1, documentId: document.id,
    model: build(document.root, document.root.name), scripts: { source: document.scripts.source } };
}
