import { mouseEvents } from '../shared/runtime';
import type { ProjectStrategy } from './strategy';

export interface AutomationCapabilities {
  authoring: { language: string; version: string; sourceLimitBytes: number; memoryMiB: number; executionMs: number; api: string[]; values: string[] };
  runtime: { language: string; version: string; actions: string[]; event: string; mouseEvents: readonly string[]; mouseTools: string[]; mouseCoordinates: string; clickableNodeTypes: string[]; scripts: string[]; api: string[] };
}
export const robloxAutomation: AutomationCapabilities = {
  authoring: {
    language: 'luau', version: '0.694', sourceLimitBytes: 262144, memoryMiB: 64, executionMs: 250,
    api: ['ui.projectType', 'ui.capabilities', 'ui.root.id', 'ui.nodes.get(id)', 'ui.nodes.children(id)', 'ui.nodes.find({name,match,className,parentId,recursive,offset,limit})', 'ui.nodes.create(className,{parentId,name,properties,previewImage?})', 'ui.nodes.setProperties(id,properties)', 'ui.nodes.setPreviewImage(id,{name,dataUrl}|nil)', 'ui.nodes.rename(id,name)', 'ui.nodes.reparent(id,parentId)', 'ui.nodes.duplicate(id,parentId?)', 'ui.nodes.remove(id)', 'ui.scripts.get("source"|"integration")', 'ui.scripts.set("source"|"integration",source)', 'print/warn'],
    values: ['UDim', 'UDim2', 'Vector2', 'Color3', 'Enum'],
  },
  runtime: {
    language: 'luau', version: '0.694', actions: ['run', 'stop', 'reset'], event: 'Activated', mouseEvents, mouseTools: ['uie.runtime.hover', 'uie.runtime.scroll', 'uie.runtime.drag'], mouseCoordinates: 'drag from/to: normalized node-local 0–1; event Position: 1280×720 canvas pixels; scroll: content pixels; mouse only, no keyboard/text input', clickableNodeTypes: ['TextButton', 'ImageButton'], scripts: ['source', 'integration'],
    api: ['_G.FX.Class', 'FX.Loader:PlayerGui("ScreenGui.Child")', 'FX.Loader:Here(root,"Child.Descendant")', 'node:Clone()', 'node:Destroy()', 'node:GetChildren()', 'node:GetPropertyChangedSignal(property):Connect(callback)', 'node.Name', 'node.Parent', 'CUIEditorUICompClass', 'OnReady', 'Render', 'GetUIConfig', 'GetUIState', 'RefreshUI', 'OnUIAction', 'EmitUIAction', 'TrackConnection', 'SetButtonEnabled'],
  },
};
export function getCapabilities(strategy: ProjectStrategy, args: Record<string, unknown> = {}) {
  const types = Object.keys(strategy.nodes);
  if (args.className !== undefined && !types.includes(String(args.className))) throw new Error('不支持的节点类型。');
  const selected = args.className === undefined ? types : [String(args.className)];
  const base = { projectType: strategy.mode, ...strategy.automation, imageAssets: { platform: 'roblox', tools: ['uie.assets.search', 'uie.assets.get', 'uie.assets.configure'], apply: 'ui.assets.apply(nodeId,assetId)', resolution: 'asset Roblox ID; missing catalog entry uses document snapshot' } };
  if (args.detail === 'summary') return { ...base, nodeTypes: selected, nodeDetails: 'Use get_capabilities({className}) for properties and allowed children, or omit filters for full capabilities.' };
  return { ...base, nodes: Object.fromEntries(selected.map(name => [name, strategy.nodes[name]])), parenting: Object.fromEntries(selected.map(parent => [parent, types.filter(child => strategy.canParent(strategy.createNode(parent), strategy.createNode(child)))])) };
}
