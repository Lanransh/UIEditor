import type { EditorCommand } from '../history/CommandHistory';
import { allNodes, findNode, findParent, updateNode, type UIDocument, type UINode } from '../shared/uiDocument';
import type { ProjectStrategy } from './strategy';

export function documentCommand(label: string, edit: (document: UIDocument) => UIDocument, strategy: ProjectStrategy): EditorCommand<UIDocument> {
  let before: UIDocument, after: UIDocument;
  return {
    label,
    execute(document) {
      if (after) return after;
      const next = edit(document);
      if (JSON.stringify(next) === JSON.stringify(document)) return document;
      after = strategy.validate(next); before = document;
      return after;
    },
    undo: () => before,
  };
}
export function insertNode(document: UIDocument, parentId: string, node: UINode, strategy: ProjectStrategy): UIDocument {
  const parent = findNode(document.root, parentId);
  if (!parent || !strategy.canParent(parent, node)) throw new Error('此节点不能放入选中的父节点，或辅助节点已存在。');
  return { ...document, root: updateNode(document.root, parentId, value => ({ ...value, children: [...value.children, node] })) };
}
export function deleteNode(document: UIDocument, id: string): UIDocument {
  const parent = findParent(document.root, id);
  if (!parent) return document;
  return { ...document, root: updateNode(document.root, parent.id, value => ({ ...value, children: value.children.filter(child => child.id !== id) })) };
}
export function cloneNode(node: UINode): UINode {
  return { ...structuredClone(node), id: crypto.randomUUID(), children: node.children.map(cloneNode) };
}
export function duplicateNode(document: UIDocument, id: string, strategy: ProjectStrategy): UIDocument {
  const node = findNode(document.root, id), parent = findParent(document.root, id);
  if (!node || !parent) return document;
  const copy = cloneNode(node); copy.name += ' 副本';
  return insertNode(document, parent.id, copy, strategy);
}
export function reparentNode(document: UIDocument, id: string, parentId: string, strategy: ProjectStrategy): UIDocument {
  const node = findNode(document.root, id), parent = findNode(document.root, parentId);
  if (!node || !parent || id === document.root.id || allNodes(node).some(child => child.id === parentId)) throw new Error('不能将节点移动到自身或自己的子节点下。');
  if (findParent(document.root, id)?.id === parentId) return document;
  return insertNode(deleteNode(document, id), parentId, node, strategy);
}
export function reorderNode(document: UIDocument, id: string, direction: -1 | 1): UIDocument {
  const parent = findParent(document.root, id);
  if (!parent) return document;
  const index = parent.children.findIndex(child => child.id === id), next = index + direction;
  if (next < 0 || next >= parent.children.length) return document;
  return { ...document, root: updateNode(document.root, parent.id, value => {
    const children = [...value.children]; [children[index], children[next]] = [children[next], children[index]];
    return { ...value, children };
  }) };
}

export type NodeDropPosition = 'before' | 'inside' | 'after';
export function nodeDropParent(document: UIDocument, id: string, targetId: string, position: NodeDropPosition, strategy: ProjectStrategy): UINode | undefined {
  const node = findNode(document.root, id), target = findNode(document.root, targetId);
  if (!node || !target || id === document.root.id || allNodes(node).some(child => child.id === targetId)) return;
  const parent = position === 'inside' ? target : findParent(document.root, targetId);
  return parent && strategy.canParent(parent, node, id) ? parent : undefined;
}
export function moveNode(document: UIDocument, id: string, targetId: string, position: NodeDropPosition, strategy: ProjectStrategy): UIDocument {
  const parent = nodeDropParent(document, id, targetId, position, strategy);
  if (!parent) return document;
  const node = findNode(document.root, id)!;
  const removed = deleteNode(document, id);
  return { ...document, root: updateNode(removed.root, parent.id, value => {
    const children = [...value.children];
    const index = position === 'inside' ? children.length : children.findIndex(child => child.id === targetId) + (position === 'after' ? 1 : 0);
    children.splice(index, 0, node);
    return { ...value, children };
  }) };
}
