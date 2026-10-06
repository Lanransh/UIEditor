import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { allNodes, findParent, type PropertyValue, type UDim, type UDim2, type UINode, type Vector2 } from '../shared/uiDocument';
import type { PropertyDefinition } from './strategy';
import type { DocumentEditor } from './useDocumentEditor';
import { layoutComponent } from './roblox';
import { moveNode, nodeDropParent, type NodeDropPosition } from './commands';

const nodeIcons = import.meta.glob<string>('../assets/roblox-node-icons/*.png', { eager: true, query: '?url', import: 'default' });

export function NodeTree({ editor }: { editor: DocumentEditor }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ parent: UINode; x: number; y: number } | null>(null);
  const menuElement = useRef<HTMLDivElement>(null);
  const draggedId = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: NodeDropPosition } | null>(null);
  useEffect(() => { setMenu(null); }, [editor.document.root, editor.busy]);
  useEffect(() => {
    if (!menu) return;
    function dismiss(event: PointerEvent) {
      if (!menuElement.current?.contains(event.target as Node)) setMenu(null);
    }
    function scroll(event: Event) {
      if (!menuElement.current?.contains(event.target as Node)) setMenu(null);
    }
    const close = () => setMenu(null);
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', scroll, true);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [menu]);
  function dropPosition(event: DragEvent<HTMLDivElement>): NodeDropPosition {
    const bounds = event.currentTarget.getBoundingClientRect(), offset = event.clientY - bounds.top;
    return offset < bounds.height / 3 ? 'before' : offset > bounds.height * 2 / 3 ? 'after' : 'inside';
  }
  useEffect(() => {
    setCollapsed(previous => {
      const next = new Set(previous);
      let parent = findParent(editor.document.root, editor.selected.id);
      while (parent) { next.delete(parent.id); parent = findParent(editor.document.root, parent.id); }
      return next;
    });
  }, [editor.selected.id, editor.document.root]);
  function branch(node: UINode, depth: number): ReactNode {
    const closed = collapsed.has(node.id);
    const position = dropTarget?.id === node.id ? dropTarget.position : null;
    return <div key={node.id} role="treeitem" aria-selected={editor.selected.id === node.id} aria-expanded={node.children.length ? !closed : undefined}>
      <div className={`node-row${editor.selected.id === node.id ? ' selected' : ''}${position ? ` drop-${position}` : ''}`} style={{ paddingLeft: 6 + depth * 18 }} title={`${node.name} · ${node.className}`}
        draggable={!editor.busy && node.id !== editor.document.root.id}
        onDragStart={event => { draggedId.current = node.id; editor.select(node.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', node.id); }}
        onDragEnd={() => { draggedId.current = null; setDropTarget(null); }}
        onDragOver={event => {
          event.stopPropagation();
          const next = dropPosition(event);
          const valid = !editor.busy && draggedId.current && nodeDropParent(editor.document, draggedId.current, node.id, next, editor.strategy);
          event.dataTransfer.dropEffect = valid ? 'move' : 'none';
          if (valid) event.preventDefault();
          setDropTarget(valid ? { id: node.id, position: next } : null);
        }}
        onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDropTarget(null); }}
        onDrop={event => {
          event.preventDefault(); event.stopPropagation();
          const id = draggedId.current, next = dropPosition(event);
          draggedId.current = null; setDropTarget(null);
          if (!editor.busy && id) editor.execute('拖拽节点', value => moveNode(value, id, node.id, next, editor.strategy));
        }}>
        <button className="node-expand" disabled={!node.children.length} aria-label={`${closed ? '展开' : '折叠'} ${node.name}`} onClick={() => setCollapsed(previous => { const next = new Set(previous); if (closed) next.delete(node.id); else next.add(node.id); return next; })}>{node.children.length ? closed ? '▸' : '▾' : ''}</button>
        <button className="node-select" aria-label={`选择节点 ${node.name}`} onClick={() => editor.select(node.id)}><img className="node-icon" src={nodeIcons[`../assets/roblox-node-icons/${node.className}.png`]} width={16} height={16} alt="" draggable={false} /><span>{node.name}</span></button>
        {editor.strategy.nodes[node.className].category !== 'component' && <button className="node-add-child" aria-label={`为 ${node.name} 添加子节点`} title="添加子节点" aria-haspopup="menu" aria-expanded={menu?.parent.id === node.id} onClick={event => {
          const bounds = event.currentTarget.getBoundingClientRect();
          setMenu({ parent: node, x: Math.max(8, Math.min(bounds.right, window.innerWidth - 208)), y: Math.max(8, Math.min(bounds.bottom, window.innerHeight - 288)) });
        }}>+</button>}
      </div>
      {!closed && node.children.length > 0 && <div role="group">{node.children.map(child => branch(child, depth + 1))}</div>}
    </div>;
  }
  const root = editor.selected.id === editor.document.root.id;
  return <fieldset className="editor-fields" disabled={editor.busy}>
    <div className="node-actions"><button disabled={root} onClick={editor.duplicate}>复制</button><button disabled={root} onClick={editor.remove}>删除</button><button disabled={root} aria-label="上移节点" onClick={() => editor.reorder(-1)}>↑</button><button disabled={root} aria-label="下移节点" onClick={() => editor.reorder(1)}>↓</button></div>
    <div role="tree" aria-label="Roblox 节点">{branch(editor.document.root, 0)}</div>
    {menu && <div ref={menuElement} className="node-add-menu" role="menu" aria-label="添加子节点" style={{ left: menu.x, top: menu.y }}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setMenu(null); } }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenu(null); }}>
      {Object.keys(editor.strategy.nodes).filter(name => editor.strategy.canParent(menu.parent, editor.strategy.createNode(name))).map((name, index) => <button key={name} role="menuitem" autoFocus={index === 0} onClick={() => {
        editor.add(name, menu.parent.id); setMenu(null);
      }}><img className="node-icon" src={nodeIcons[`../assets/roblox-node-icons/${name}.png`]} width={16} height={16} alt="" />{name}</button>)}
    </div>}
  </fieldset>;
}

function NumberInput({ value, onChange, label, definition, disabled }: { value: number; onChange: (value: number) => void; label: string; definition?: PropertyDefinition; disabled?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  return <input type="number" aria-label={label} disabled={disabled} min={definition?.min} max={definition?.max} step={definition?.integer ? 1 : 'any'} value={draft ?? value} onChange={event => setDraft(event.target.value)} onBlur={event => {
    const next = event.target.valueAsNumber;
    if (Number.isFinite(next)) onChange(next);
    setDraft(null);
  }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />;
}
function StringInput({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return <input aria-label={label} value={draft ?? value} onChange={event => setDraft(event.target.value)} onBlur={event => { onChange(event.target.value); setDraft(null); }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />;
}
function PropertyField({ name, definition, value, change, disabled }: { name: string; definition: PropertyDefinition; value: PropertyValue; change: (value: PropertyValue) => void; disabled: boolean }) {
  let input: ReactNode;
  if (definition.kind === 'boolean') input = <input type="checkbox" aria-label={name} checked={value as boolean} disabled={disabled} onChange={event => change(event.target.checked)} />;
  else if (definition.kind === 'enum') input = <select aria-label={name} value={value as string} disabled={disabled} onChange={event => change(event.target.value)}>{definition.choices!.map(choice => <option key={choice}>{choice}</option>)}</select>;
  else if (definition.kind === 'number') input = <NumberInput label={name} value={value as number} definition={definition} disabled={disabled} onChange={change} />;
  else if (definition.kind === 'color') input = <input type="color" aria-label={name} value={value as string} disabled={disabled} onChange={event => change(event.target.value)} />;
  else if (['vector', 'udim', 'udim2'].includes(definition.kind)) {
    const fields = definition.kind === 'udim2' ? ['x.scale', 'x.offset', 'y.scale', 'y.offset'] : definition.kind === 'udim' ? ['scale', 'offset'] : ['x', 'y'];
    input = <div className="property-parts">{fields.map(field => {
      const [axis, component] = field.split('.');
      const number = component ? (value as UDim2)[axis as 'x' | 'y'][component as 'scale' | 'offset'] : (value as unknown as Record<string, number>)[axis];
      return <label key={field}><span>{field}</span><NumberInput label={`${name}.${field}`} definition={definition} value={number} disabled={disabled} onChange={next => {
        if (component) { const copy = structuredClone(value as UDim2); copy[axis as 'x' | 'y'][component as 'scale' | 'offset'] = next; change(copy); }
        else change({ ...value as UDim | Vector2, [axis]: next });
      }} /></label>;
    })}</div>;
  } else input = <StringInput label={name} value={value as string} onChange={change} />;
  return <div className="property-field"><span>{name}</span>{input}</div>;
}
export function NodeProperties({ editor }: { editor: DocumentEditor }) {
  const node = editor.selected, parent = findParent(editor.document.root, node.id);
  const layout = parent && layoutComponent(parent);
  const descendants = new Set(allNodes(node).map(value => value.id));
  const parents = allNodes(editor.document.root).filter(value => !descendants.has(value.id) && editor.strategy.canParent(value, node, node.id));
  return <fieldset className="editor-fields property-list" disabled={editor.busy} key={node.id}>
    <div className="property-field"><span>界面名称</span><StringInput label="界面名称" value={editor.document.name} onChange={name => editor.execute('修改界面名称', document => ({ ...document, name }))} /></div>
    <div className="property-field"><span>节点名称</span><StringInput label="节点名称" value={node.name} onChange={name => editor.editNode(node.id, value => ({ ...value, name }), '节点改名')} /></div>
    <p className="property-note">{node.className} · <span title={node.id}>{node.id.slice(0, 8)}</span></p>
    {parent && <div className="property-field"><span>父节点</span><select aria-label="父节点" value={parent.id} onChange={event => editor.reparent(event.target.value)}>{parents.map(value => <option key={value.id} value={value.id}>{value.name} · {value.className}</option>)}</select></div>}
    {layout && editor.strategy.nodes[node.className].category === 'object' && <p className="property-note">位置由 {layout.className} 控制；网格同时控制尺寸。请调整 LayoutOrder 或父容器布局。</p>}
    {Object.entries(editor.strategy.nodes[node.className].properties).map(([name, definition]) => <PropertyField key={name} name={name} definition={definition} value={node.properties[name]} disabled={!!layout && editor.strategy.nodes[node.className].category === 'object' && (name === 'Position' || name === 'Rotation' || (name === 'Size' && layout.className === 'UIGridLayout'))} change={value => editor.editNode(node.id, current => ({ ...current, properties: { ...current.properties, [name]: value } }))} />)}
    {node.className.startsWith('Text') && <p className="property-note">字体使用本机替代字体预览，文字排版需在 Roblox 中确认。</p>}
    {node.className === 'UIGradient' && <p className="property-note">ColorStart/End 与 TransparencyStart/End 表示首尾两个关键点，后续导出对应 Roblox 序列。</p>}
    {node.className === 'CanvasGroup' && <p className="property-note">GroupColor3 使用浏览器颜色混合近似展示，最终颜色需在 Roblox 中确认。</p>}
    {node.className.startsWith('Image') && <div className="image-preview-tools"><p className="property-note">Image 保存 Roblox 资源 ID；本地图片仅用于预览，不会上传。</p><button onClick={() => void editor.pickImage()}>选择预览图片</button>{node.previewImage ? <><p className="property-note">{node.previewImage.name}</p><button onClick={() => editor.editNode(node.id, current => { const { previewImage: _, ...rest } = current; return rest; }, '清除预览图片')}>清除预览图片</button></> : <p className="property-note">缺少本地预览图片，画布显示占位。</p>}</div>}
  </fieldset>;
}
