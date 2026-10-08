import type { Result } from './project';
import type { UIDocument, UINode, UIScripts, JSONValue, PropertyValue } from './uiDocument';

export interface RuntimeLog { kind: 'output' | 'warning' | 'action' | 'error' | 'input'; message: string }
export type RuntimePatch = Record<string, { name?: string; properties?: Record<string, PropertyValue> }>;
export interface RuntimeFrame { document: UIDocument; disabled: string[]; logs: RuntimeLog[]; listeners?: Record<string, string[]>; patch?: RuntimePatch }
export type RuntimeUpdate = RuntimeFrame | (Omit<RuntimeFrame, 'document' | 'patch'> & { patch: RuntimePatch });
type RuntimeResult<T> = Result<T> & { logs?: RuntimeLog[] };
export const mouseEvents = ['MouseEnter', 'MouseLeave', 'MouseMoved', 'MouseWheelForward', 'MouseWheelBackward', 'InputBegan', 'InputChanged', 'InputEnded'] as const;
export type MouseEventName = typeof mouseEvents[number];
export type RuntimeCommand = { type: 'mouse'; node: string; event: MouseEventName; x: number; y: number; dx: number; dy: number; button: number; wheel?: boolean; cancelled?: boolean } | { type: 'event'; node: string } | { type: 'show' | 'hide' } | { type: 'set'; node: string; property: string; value: PropertyValue };
export interface RuntimeAPI {
  start(document: UIDocument): Promise<RuntimeResult<{ session: string; frame: RuntimeFrame }>>;
  command(session: string, command: RuntimeCommand): Promise<RuntimeResult<RuntimeUpdate>>;
  stop(session: string): Promise<Result<null>>;
  onEnded(callback: (event: { session: string; error: string; logs?: RuntimeLog[] }) => void): () => void;
}
// Apply only property/name deltas; structural updates still arrive as a validated full tree.
export function applyRuntimePatch(document: UIDocument, source: unknown): UIDocument {
  validateJSON(source);
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('运行增量必须是对象。');
  const patch = source as RuntimePatch, pending = new Set(Object.keys(patch));
  function visit(node: UINode): UINode {
    const change = patch[node.id];
    let updated = node;
    if (change !== undefined) {
      pending.delete(node.id);
      if (!change || typeof change !== 'object' || Array.isArray(change) || Object.keys(change).some(key => !['name', 'properties'].includes(key))
        || (change.name !== undefined && (typeof change.name !== 'string' || !change.name.trim()))
        || (change.properties !== undefined && (!change.properties || typeof change.properties !== 'object' || Array.isArray(change.properties) || Object.keys(change.properties).some(key => !Object.hasOwn(node.properties, key))))) throw new Error('无效的运行节点增量。');
      updated = { ...node, ...(change.name !== undefined ? { name: change.name } : {}), ...(change.properties ? { properties: { ...node.properties, ...change.properties } } : {}) };
    }
    const children = node.children.map(visit);
    return children.some((child, index) => child !== node.children[index]) ? { ...updated, children } : updated;
  }
  const root = visit(document.root);
  if (pending.size) throw new Error('运行增量引用了不存在的节点。');
  return root === document.root ? document : { ...document, root };
}
export function validateJSON(value: unknown, depth = 0): JSONValue {
  if (depth > 64) throw new Error('数据嵌套超过 64 层。');
  if (value === null || typeof value === 'boolean' || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (Array.isArray(value)) return value.map(item => validateJSON(item, depth + 1));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, item] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('不支持的数据字段。');
      validateJSON(item, depth + 1);
    }
    return value as JSONValue;
  }
  throw new Error('数据必须是有限数值、文本、布尔、null、数组或对象。');
}
function luauData(value: JSONValue): string {
  if (value === null) return 'JSONNull';
  if (Array.isArray(value)) return `{ ${value.map(luauData).join(', ')} }`;
  if (typeof value === 'object') return `{ ${Object.entries(value).map(([key, item]) => `[${luauData(key)}] = ${luauData(item)}`).join(', ')} }`;
  return JSON.stringify(value).replace(/\\(?:u([0-9a-f]{4})|.)/gi, (escaped, code) => code ? `\\u{${code}}` : escaped);
}
export function validateScripts(value: unknown, legacy = false): UIScripts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('脚本定义无效。');
  const scripts = value as Record<string, unknown>;
  const keys = Object.keys(scripts).sort().join(',');
  if (legacy) {
    if (!['config,references,source,state', 'config,integration,references,source,state'].includes(keys) || typeof scripts.config !== 'string' || typeof scripts.source !== 'string' || (scripts.integration !== undefined && typeof scripts.integration !== 'string')) throw new Error('旧版脚本字段无效。');
    validateJSON(scripts.state); validateJSON(scripts.references);
    if (!scripts.references || typeof scripts.references !== 'object' || Array.isArray(scripts.references)) throw new Error('节点引用必须是对象。');
    for (const [name, id] of Object.entries(scripts.references)) if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || typeof id !== 'string' || !id) throw new Error('节点引用无效。');
    return validateScripts({
      source: `local FX = _G.FX
local UI = FX.Class("UIInteraction", "CUIEditorUICompClass")
UI._References = ${luauData(scripts.references as JSONValue)}
${scripts.source}
function UI:OnReady()
    if self.OnMount then
        self:OnMount()
    end
end
return UI`,
      integration: `local FX = _G.FX
local Preview = FX.Class("UIPreview", "UIInteraction")
local function Config()
${scripts.config}
end
function Preview:Ctor(owner)
    Preview.Super.Ctor(self, owner)
    self.Config = Config()
    self.State = ${luauData(scripts.state as JSONValue)}
end
${scripts.integration ?? ''}
return Preview`,
    });
  }
  if (keys !== 'integration,source' || [scripts.source, scripts.integration].some(source => typeof source !== 'string' || source.length > 262144)) throw new Error('脚本字段无效，单份源码最多 256 KiB 字符。');
  return scripts as unknown as UIScripts;
}
