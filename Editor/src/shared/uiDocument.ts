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
  version: 3;
  id: string;
  name: string;
  canvas: { width: 1280; height: 720 };
  root: UINode;
  scripts: UIScripts;
}
export type JSONValue = null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue };
export const defaultSource = `local FX = _G.FX
local UI = FX.Class("UIInteraction", "FCUICompClass")

function UI:OnReady()
    -- 使用 FX.Loader:Here(self:GetRootNode(), "节点路径") 获取节点。
end

function UI:Render(state)
    -- 根据接入类提供的数据更新界面。
end

return UI`;
export const defaultIntegration = `local FX = _G.FX
local Preview = FX.Class("UIPreview", "UIInteraction")

function Preview:Ctor(owner)
    Preview.Super.Ctor(self, owner)
    self.Config = {}
    self.State = {}
end

function Preview:GetUIConfig() return self.Config end
function Preview:GetUIState() return self.State end
function Preview:BindUIData() self:RefreshUI() end
function Preview:OnUIAction(action, payload)
    print("模拟动作", action)
end

return Preview`;
export interface UIScripts { source: string; integration: string }
export const emptyScripts = (): UIScripts => ({ source: defaultSource, integration: defaultIntegration });
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
