import type { Result } from './project';
import { allNodes, type UIDocument, type UIScripts, type JSONValue } from './uiDocument';

export interface RuntimeLog { kind: 'output' | 'action' | 'error'; message: string }
export interface RuntimeFrame { document: UIDocument; disabled: string[]; logs: RuntimeLog[] }
export interface RuntimeAPI {
  start(document: UIDocument): Promise<Result<{ session: string; frame: RuntimeFrame }>>;
  command(session: string, command: { type: 'event'; node: string } | { type: 'state'; state: JSONValue }): Promise<Result<RuntimeFrame>>;
  stop(session: string): Promise<Result<null>>;
  onEnded(callback: (event: { session: string; error: string }) => void): () => void;
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
export function validateScripts(value: unknown): UIScripts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('脚本定义无效。');
  const scripts = value as UIScripts;
  if (Object.keys(value).sort().join(',') !== 'config,references,source,state' || typeof scripts.config !== 'string' || typeof scripts.source !== 'string' || scripts.config.length > 262144 || scripts.source.length > 262144) throw new Error('脚本字段无效，单份源码最多 256 KiB 字符。');
  if (!scripts.references || typeof scripts.references !== 'object' || Array.isArray(scripts.references)) throw new Error('节点引用必须是对象。');
  for (const [name, id] of Object.entries(scripts.references)) if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || typeof id !== 'string' || !id) throw new Error('引用名必须是英文标识符，引用值必须是节点 ID。');
  validateJSON(scripts.references);
  validateJSON(scripts.state);
  return scripts;
}
export function validateReferences(document: UIDocument) {
  const ids = new Set(allNodes(document.root).map(node => node.id));
  for (const [name, id] of Object.entries(document.scripts.references)) if (!ids.has(id)) throw new Error(`节点引用 ${name} 已失效，请重新绑定。`);
}
