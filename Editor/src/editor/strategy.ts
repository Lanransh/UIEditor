import type { UIDocument, UINode, PropertyValue } from '../shared/uiDocument';

export interface PropertyDefinition {
  kind: 'number' | 'string' | 'boolean' | 'color' | 'enum' | 'udim' | 'udim2' | 'vector';
  value: PropertyValue;
  min?: number;
  max?: number;
  integer?: boolean;
  choices?: string[];
}
export interface NodeDefinition {
  category: 'root' | 'object' | 'component';
  properties: Record<string, PropertyDefinition>;
}
export interface PreviewRect { x: number; y: number; width: number; height: number; scale: number }
export interface ProjectStrategy {
  mode: 'roblox';
  nodes: Record<string, NodeDefinition>;
  createDocument(name?: string): UIDocument;
  createNode(className: string): UINode;
  canParent(parent: UINode, child: UINode, excludingId?: string): boolean;
  validate(source: unknown): UIDocument;
  layout(parent: UINode, width: number, height: number): Map<string, PreviewRect>;
}
