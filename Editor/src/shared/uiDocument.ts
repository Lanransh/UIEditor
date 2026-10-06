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
const reservedNames = new Set('and break do else elseif end false for function if in local nil not or repeat return then true until while continue type export const'.split(' '));
export function interfaceNameError(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name.trim())) return '名称只能包含英文字母、数字和下划线，且不能以数字开头。';
  if (reservedNames.has(name.trim())) return '名称不能使用 Luau 关键字。';
  return '';
}
export function scriptClassNames(name: string) {
  const error = interfaceNameError(name);
  if (error) throw new Error(error);
  return { source: `C${name.trim()}UIBaseCompClass`, integration: `C${name.trim()}UIPreviewCompClass` };
}
export interface UIScripts { source: string; integration: string }
export function emptyScripts(name = 'Untitled'): UIScripts {
  const classes = scriptClassNames(name);
  return { source: `local FX = _G.FX
local FXLoader = FX.Loader
local ${classes.source} = FX.Class("${classes.source}", "FCUICompClass")

-- 先用 FXLoader:PlayerGui("实际ScreenGui名") 获取界面，再用 Here(root, "Panel.Button") 查子节点。
function ${classes.source}:OnReady()
end

-- 根据接入类数据刷新展示，不在这里创建视觉效果。
-- @param state table 接入类提供的显示状态
function ${classes.source}:Render(state)
end

return ${classes.source}`, integration: `local FX = _G.FX
local ${classes.integration} = FX.Class("${classes.integration}", "${classes.source}")

-- 初始化本次运行的模拟数据。
-- @param owner table 编辑器提供的组件宿主，传递给父类
function ${classes.integration}:Ctor(owner)
    ${classes.integration}.Super.Ctor(self, owner)
    self.Config = {}
    self.State = {}
end

-- 提供展示配置，业务标识与文案分开保存。
-- @return table 界面配置
function ${classes.integration}:GetUIConfig()
    return self.Config
end

-- 提供模拟状态，不能作为真实发奖依据。
-- @return table 当前显示状态
function ${classes.integration}:GetUIState()
    return self.State
end

-- 数据就绪后触发首帧展示。
function ${classes.integration}:BindUIData()
    self:RefreshUI()
end

-- 处理展示层动作；只更新模拟数据，再调用 RefreshUI。
-- @param action string 动作名称
-- @param payload table 动作必要参数，例如稳定奖励 ID
function ${classes.integration}:OnUIAction(action, payload)
end

return ${classes.integration}` };
}
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
