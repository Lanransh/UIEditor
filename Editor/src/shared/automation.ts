import { allNodes, findNode, findParent, type UIDocument, type UINode } from './uiDocument';

export const toolNames = ['uie.editor.get_state', 'uie.editor.get_capabilities', 'uie.nodes.get', 'uie.nodes.find', 'uie.code.execute', 'uie.scripts.get', 'uie.scripts.set', 'uie.document.list', 'uie.document.new', 'uie.document.open', 'uie.document.save', 'uie.runtime.control', 'uie.runtime.click', 'uie.debug.get_diagnostics', 'uie.debug.screenshot', 'uie.assets.search', 'uie.assets.get', 'uie.assets.configure', 'uie.project.list', 'uie.runtime.batch', 'uie.runtime.hover', 'uie.runtime.scroll', 'uie.runtime.drag'] as const;
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
export function nodeSummary(root: UINode, node: UINode, compact = false): unknown {
  if (compact) return { id: node.id, name: node.name, className: node.className };
  const parts = [node.name]; let parent = findParent(root, node.id);
  while (parent) { parts.unshift(parent.name); parent = findParent(root, parent.id); }
  return { id: node.id, name: node.name, className: node.className, parentId: findParent(root, node.id)?.id ?? null, path: parts.join('/') };
}
export function getNode(document: UIDocument, args: Record<string, unknown>): unknown {
  const node = args.id === undefined ? document.root : findNode(document.root, String(args.id));
  if (!node) throw new Error('节点不存在。');
  const depth = integer(args.depth, 0, 0, 64);
  const budget = integer(args.maxNodes, 200, 1, 2000);
  let count = 0;
  const visit = (node: UINode, remaining: number): unknown => {
    ++count;
    const children: unknown[] = [];
    for (const child of node.children) {
      if (count >= budget) break;
      if (remaining) children.push(visit(child, remaining - 1));
      else { ++count; children.push(nodeSummary(document.root, child, args.compact === true)); }
    }
    return { ...(nodeSummary(document.root, node, args.compact === true) as object), properties: node.properties, ...(node.imageAssetId ? { imageAssetId: node.imageAssetId } : {}), children, ...(children.length < node.children.length ? { truncated: true, omittedChildren: node.children.length - children.length } : {}) };
  };
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
  return { nodes: nodes.slice(offset, offset + limit).map(node => nodeSummary(document.root, node, args.compact === true)), total: nodes.length, nextOffset: offset + limit < nodes.length ? offset + limit : null };
}

export function nodeTree(document: UIDocument, args: Record<string, unknown>) {
  const root = args.id === undefined ? document.root : findNode(document.root, String(args.id));
  if (!root) throw new Error('节点不存在。');
  const depth = integer(args.depth, 3, 0, 64), maxNodes = integer(args.maxNodes, 200, 1, 2000);
  const lines: string[] = [], reasons = new Set<string>();
  let count = 0;
  function visit(node: UINode, level: number, prefix: string, branch: string) {
    ++count;
    lines.push(`${prefix}${branch}${node.name.replace(/[\r\n\t]/g, ' ')} [${node.className}] id=${node.id}`);
    const next = prefix + (branch === '' ? '' : branch === '└── ' ? '    ' : '│   ');
    if (level === depth && node.children.length) { reasons.add('depth'); lines.push(`${next}└── …（深度限制，${node.children.length} 个子节点未展开）`); return; }
    for (let i = 0; i < node.children.length; ++i) {
      if (count >= maxNodes) { reasons.add('maxNodes'); lines.push(`${next}└── …（节点数量限制，${node.children.length - i} 个子节点未展开）`); break; }
      visit(node.children[i], level + 1, next, i === node.children.length - 1 ? '└── ' : '├── ');
    }
  }
  visit(root, 0, '', '');
  return { tree: lines.join('\n'), nodeCount: count, truncated: reasons.size > 0, truncationReasons: [...reasons] };
}
