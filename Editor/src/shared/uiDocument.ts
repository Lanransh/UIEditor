export interface UDim { scale: number; offset: number }
export interface UDim2 { x: UDim; y: UDim }
export interface Vector2 { x: number; y: number }
export type PropertyValue = string | number | boolean | UDim | UDim2 | Vector2;
export interface UINode {
  id: string;
  className: string;
  name: string;
  properties: Record<string, PropertyValue>;
  children: UINode[];
  previewImage?: { name: string; dataUrl: string };
}
export interface UIDocument {
  format: 'roblox-ui';
  version: 2;
  id: string;
  name: string;
  canvas: { width: 1280; height: 720 };
  root: UINode;
  scripts: UIScripts;
}
export type JSONValue = null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue };
export interface UIScripts { config: string; source: string; references: Record<string, string>; state: JSONValue }
export const emptyScripts = (): UIScripts => ({ config: 'return {}', source: '', references: {}, state: {} });
export const dim = (scale = 0, offset = 0): UDim => ({ scale, offset });
export const dim2 = (width = 200, height = 100): UDim2 => ({ x: dim(0, width), y: dim(0, height) });
export function findNode(root: UINode, id: string): UINode | undefined {
  if (root.id === id) return root;
  for (const child of root.children) { const found = findNode(child, id); if (found) return found; }
}
export function findParent(root: UINode, id: string): UINode | undefined {
  for (const child of root.children) {
    if (child.id === id) return root;
    const found = findParent(child, id); if (found) return found;
  }
}
export function allNodes(root: UINode): UINode[] { return [root, ...root.children.flatMap(allNodes)]; }
export function updateNode(root: UINode, id: string, edit: (node: UINode) => UINode): UINode {
  if (root.id === id) return edit(root);
  return { ...root, children: root.children.map(child => updateNode(child, id, edit)) };
}
