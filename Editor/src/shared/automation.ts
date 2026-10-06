import { allNodes, findNode, findParent, type UIDocument, type UINode } from './uiDocument';

export const toolNames = ['uie.editor.get_state', 'uie.editor.get_capabilities', 'uie.nodes.get', 'uie.nodes.find', 'uie.code.execute', 'uie.scripts.get', 'uie.scripts.set', 'uie.document.list', 'uie.document.new', 'uie.document.open', 'uie.document.save', 'uie.runtime.control', 'uie.runtime.click', 'uie.debug.get_diagnostics', 'uie.debug.screenshot', 'uie.assets.search', 'uie.assets.get', 'uie.assets.configure'] as const;
export type AutomationRequest = { name: string; arguments: Record<string, unknown> };
export interface AutomationAPI {
  onRequest(handler: (request: AutomationRequest) => Promise<unknown>): () => void;
  invoke(operation: string, argument?: unknown): Promise<any>;
}
declare global { interface Window { automation: AutomationAPI } }

export function integer(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error(`整数必须在 ${min}–${max} 范围。`);
  return value;
}
export function nodeSummary(root: UINode, node: UINode): unknown {
  const parts = [node.name]; let parent = findParent(root, node.id);
  while (parent) { parts.unshift(parent.name); parent = findParent(root, parent.id); }
  return { id: node.id, name: node.name, className: node.className, parentId: findParent(root, node.id)?.id ?? null, path: parts.join('/') };
}
export function getNode(document: UIDocument, args: Record<string, unknown>): unknown {
  const node = findNode(document.root, String(args.id));
  if (!node) throw new Error('节点不存在。');
  const depth = integer(args.depth, 0, 0, 64);
  const visit = (node: UINode, remaining: number): unknown => ({ ...(nodeSummary(document.root, node) as object), properties: node.properties, ...(node.imageAssetId ? { imageAssetId: node.imageAssetId } : {}), children: node.children.map(child => remaining ? visit(child, remaining - 1) : nodeSummary(document.root, child)) });
  return visit(node, depth);
}
export function findNodes(document: UIDocument, args: Record<string, unknown>) {
  if (args.name !== undefined && typeof args.name !== 'string') throw new Error('name 必须是字符串。');
  if (args.className !== undefined && typeof args.className !== 'string') throw new Error('className 必须是字符串。');
  if (args.match !== undefined && !['exact', 'contains'].includes(String(args.match))) throw new Error('match 必须是 exact 或 contains。');
  if (args.recursive !== undefined && typeof args.recursive !== 'boolean') throw new Error('recursive 必须是布尔值。');
  const parent = args.parentId === undefined ? document.root : findNode(document.root, String(args.parentId));
  if (!parent) throw new Error('父节点不存在。');
  const candidates = args.recursive === false ? parent.children : args.parentId === undefined ? allNodes(parent) : allNodes(parent).slice(1);
  const nodes = candidates.filter(node => (args.name === undefined || (args.match === 'contains' ? node.name.includes(String(args.name)) : node.name === args.name)) && (args.className === undefined || node.className === args.className));
  const offset = integer(args.offset, 0, 0, 5000), limit = integer(args.limit, 50, 1, 200);
  return { nodes: nodes.slice(offset, offset + limit).map(node => nodeSummary(document.root, node)), total: nodes.length, nextOffset: offset + limit < nodes.length ? offset + limit : null };
}
