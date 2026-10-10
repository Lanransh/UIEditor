import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Layers3 } from 'lucide-react';
import { allNodes, findParent, type PropertyValue, type UDim, type UDim2, type UINode, type Vector2 } from '../shared/uiDocument';
import type { PropertyDefinition } from './strategy';
import type { DocumentEditor } from './useDocumentEditor';
import { layoutComponent } from './roblox';
import { moveNode, nodeDropParent, type NodeDropPosition } from './commands';
import { SaveDocumentDialog } from './SaveDocumentDialog';

const nodeIcons = import.meta.glob<string>('../assets/roblox-node-icons/*.png', { eager: true, query: '?url', import: 'default' });

export function NodeTree({ editor }: { editor: DocumentEditor }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!query) return null;
    const ids = new Set<string>();
    function visit(node: UINode): boolean {
      const childMatches = node.children.map(visit).some(Boolean);
      const matches = node.name.toLowerCase().includes(query) || childMatches;
      if (matches) ids.add(node.id);
      return matches;
    }
    visit(editor.inspectionDocument.root);
    return ids;
  }, [query, editor.inspectionDocument.root]);
  useEffect(() => {
    if (visible) setCollapsed(previous => new Set([...previous].filter(id => !visible.has(id))));
  }, [visible]);
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; original: string; value: string } | null>(null);
  const [menu, setMenu] = useState<{ parent: UINode; x: number; y: number; context?: boolean } | null>(null);
  const menuElement = useRef<HTMLDivElement>(null);
  const renameInput = useRef<HTMLInputElement>(null);
  const renameCancelled = useRef(false);
  const draggedId = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: NodeDropPosition } | null>(null);
  useEffect(() => { setMenu(null); }, [editor.inspectionDocument.root, editor.busy]);
  useEffect(() => {
    if (!renaming) return;
    renameInput.current?.focus();
    renameInput.current?.select();
  }, [renaming?.id]);
  function beginRename(node: UINode) {
    if (editor.busy) return;
    renameCancelled.current = false;
    setMenu(null);
    setRenaming({ id: node.id, original: node.name, value: node.name });
  }
  function commitRename() {
    const current = renaming;
    setRenaming(null);
    if (current && current.value !== current.original) editor.editProperty(current.id, 'Name', current.value);
  }
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat || event.key !== 'F2' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || editor.busy) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.closest('input, textarea, select') || target.isContentEditable)) return;
      event.preventDefault();
      beginRename(editor.selected);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [editor.busy, editor.selected.id, editor.selected.name]);
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
      let parent = findParent(editor.inspectionDocument.root, editor.selected.id);
      while (parent) { next.delete(parent.id); parent = findParent(editor.inspectionDocument.root, parent.id); }
      return next;
    });
  }, [editor.selected.id, editor.inspectionDocument.root]);
  function branch(node: UINode, depth: number): ReactNode {
    if (visible && !visible.has(node.id)) return null;
    const closed = collapsed.has(node.id);
    const position = dropTarget?.id === node.id ? dropTarget.position : null;
    return <div key={node.id} role="treeitem" aria-selected={editor.selected.id === node.id} aria-expanded={node.children.length ? !closed : undefined}>
      <div className={`node-row${editor.selected.id === node.id ? ' selected' : ''}${position ? ` drop-${position}` : ''}`} style={{ paddingLeft: 6 + depth * 18 }} title={`${node.name} · ${node.className}`}
        draggable={!editor.busy && node.id !== editor.document.root.id && renaming?.id !== node.id}
        onContextMenu={event => {
          event.preventDefault(); event.stopPropagation();
          if (editor.busy || !editor.select(node.id)) return;
          setMenu({ parent: node, context: true, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 208)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 288)) });
        }}
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
        {renaming?.id === node.id
          ? <div className="node-select node-renaming"><img className="node-icon" src={nodeIcons[`../assets/roblox-node-icons/${node.className}.png`]} width={16} height={16} alt="" draggable={false} /><input ref={renameInput} aria-label={`重命名节点 ${node.name}`} value={renaming.value} onChange={event => setRenaming({ ...renaming, value: event.target.value })} onBlur={() => {
            if (renameCancelled.current) { renameCancelled.current = false; return; }
            commitRename();
          }} onKeyDown={event => {
            if (event.key === 'Enter') event.currentTarget.blur();
            else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); renameCancelled.current = true; setRenaming(null); }
          }} /></div>
          : <button className="node-select" aria-label={`选择节点 ${node.name}`} onClick={() => editor.select(node.id)}><img className="node-icon" src={nodeIcons[`../assets/roblox-node-icons/${node.className}.png`]} width={16} height={16} alt="" draggable={false} /><span>{node.name}</span></button>}
        {editor.strategy.nodes[node.className].category !== 'component' && <button disabled={editor.busy} className="node-add-child" aria-label={`为 ${node.name} 添加子节点`} title="添加子节点" aria-haspopup="menu" aria-expanded={menu?.parent.id === node.id} onClick={event => {
          const bounds = event.currentTarget.getBoundingClientRect();
          setMenu({ parent: node, x: Math.max(8, Math.min(bounds.right, window.innerWidth - 208)), y: Math.max(8, Math.min(bounds.bottom, window.innerHeight - 288)) });
        }}>+</button>}
      </div>
      {!closed && node.children.length > 0 && <div role="group">{node.children.map(child => branch(child, depth + 1))}</div>}
    </div>;
  }
  const addableNodes = menu ? Object.keys(editor.strategy.nodes).filter(name => editor.strategy.canParent(menu.parent, editor.strategy.createNode(name))) : [];
  function setBranchExpanded(node: UINode, expanded: boolean, recursive: boolean) {
    setCollapsed(previous => {
      const next = new Set(previous);
      for (const target of recursive ? allNodes(node) : [node]) {
        if (expanded) next.delete(target.id); else if (target.children.length) next.add(target.id);
      }
      if (expanded && !recursive) for (const child of node.children) if (child.children.length) next.add(child.id);
      return next;
    });
    setMenu(null);
  }
  return <>
    <h2><Layers3 size={16} />节点树<input className="node-tree-search" type="search" aria-label="搜索节点名称" placeholder="搜索节点名称" value={search} onChange={event => { setSearch(event.target.value); setMenu(null); }} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setSearch(''); } }} /></h2>
    <fieldset className="editor-fields" disabled={editor.inspectionBusy}>
      <div role="tree" aria-label="Roblox 节点">{branch(editor.inspectionDocument.root, 0)}</div>
      {visible?.size === 0 && <p role="status">没有匹配的节点</p>}
      {menu && <div ref={menuElement} className="node-add-menu" role="menu" aria-label={menu.context ? '节点操作' : '添加子节点'} style={{ left: menu.x, top: menu.y }}
        onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setMenu(null); } }}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenu(null); }}>
        {menu.context && <button role="menuitem" autoFocus onClick={() => beginRename(menu.parent)}>重命名</button>}
        {menu.context && <button role="menuitem" onClick={() => { setMenu(null); setSaving(true); }}>保存…</button>}
        {menu.context && menu.parent.children.length > 0 && <>
          <button role="menuitem" onClick={() => setBranchExpanded(menu.parent, true, true)}>展开子节点(递归)</button>
          <button role="menuitem" onClick={() => setBranchExpanded(menu.parent, true, false)}>展开子节点</button>
          <button role="menuitem" onClick={() => setBranchExpanded(menu.parent, false, true)}>收起子节点(递归)</button>
          <button role="menuitem" onClick={() => setBranchExpanded(menu.parent, false, false)}>收起子节点</button>
        </>}
        {menu.context && addableNodes.length > 0 && <div className="node-menu-separator" role="separator" />}
        {addableNodes.map((name, index) => <button key={name} role="menuitem" autoFocus={!menu.context && index === 0} onClick={() => {
          editor.add(name, menu.parent.id); setMenu(null);
        }}><img className="node-icon" src={nodeIcons[`../assets/roblox-node-icons/${name}.png`]} width={16} height={16} alt="" />{name}</button>)}
      </div>}
      {saving && <SaveDocumentDialog editor={editor} onClose={() => setSaving(false)} />}
    </fieldset>
  </>;
}

function NumberInput({ value, onChange, label, definition, disabled }: { value: number; onChange: (value: number) => void; label: string; definition?: PropertyDefinition; disabled?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  return <input type="number" aria-label={label} disabled={disabled} min={definition?.min} max={definition?.max} step={definition?.integer ? 1 : 'any'} value={draft ?? value} onChange={event => setDraft(event.target.value)} onBlur={event => {
    const next = event.target.valueAsNumber;
    if (Number.isFinite(next)) onChange(next);
    setDraft(null);
  }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />;
}
function StringInput({ value, onChange, label, disabled }: { value: string; onChange: (value: string) => void; label: string; disabled?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  return <input aria-label={label} disabled={disabled} value={draft ?? value} onChange={event => setDraft(event.target.value)} onBlur={event => { onChange(event.target.value); setDraft(null); }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />;
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
      return <label key={field}><span>{field}</span><NumberInput label={`${name}.${field}`} definition={{ ...definition, integer: field === 'offset' || component === 'offset' }} value={number} disabled={disabled} onChange={next => {
        if (component) { const copy = structuredClone(value as UDim2); copy[axis as 'x' | 'y'][component as 'scale' | 'offset'] = next; change(copy); }
        else change({ ...value as UDim | Vector2, [axis]: next });
      }} /></label>;
    })}</div>;
  } else input = <StringInput label={name} value={value as string} disabled={disabled} onChange={change} />;
  return <div className="property-field"><span>{name}</span>{input}</div>;
}
export function NodeProperties({ editor }: { editor: DocumentEditor }) {
  const node = editor.selected, parent = findParent(editor.inspectionDocument.root, node.id);
  const layout = parent && layoutComponent(parent);
  const descendants = new Set(allNodes(node).map(value => value.id));
  const parents = allNodes(editor.inspectionDocument.root).filter(value => !descendants.has(value.id) && editor.strategy.canParent(value, node, node.id));
  return <fieldset className="editor-fields property-list" disabled={editor.inspectionBusy} key={`${node.id}-${editor.runtime.active}`}>
    {editor.runtime.active && <p className="property-note">运行属性仅临时生效，停止或重置后恢复，不保存。</p>}
    <div className="property-field"><span>界面名称</span><StringInput disabled={editor.runtime.active} label="界面名称" value={editor.document.name} onChange={name => editor.execute('修改界面名称', document => ({ ...document, name }))} /></div>
    <div className="property-field"><span>节点名称</span><StringInput label="节点名称" value={node.name} onChange={name => editor.editProperty(node.id, 'Name', name)} /></div>
    <p className="property-note">{node.className} · <span title={node.id}>{node.id.slice(0, 8)}</span></p>
    {parent && <div className="property-field"><span>父节点</span><select disabled={editor.runtime.active} aria-label="父节点" value={parent.id} onChange={event => editor.reparent(event.target.value)}>{parents.map(value => <option key={value.id} value={value.id}>{value.name} · {value.className}</option>)}</select></div>}
    {layout && editor.strategy.nodes[node.className].category === 'object' && <p className="property-note">位置由 {layout.className} 控制；网格同时控制尺寸。请调整 LayoutOrder 或父容器布局。</p>}
    {Object.entries(editor.strategy.nodes[node.className].properties).map(([name, definition]) => <PropertyField key={name} name={name} definition={definition} value={node.properties[name]} disabled={(name === 'Image' && !!node.imageAssetId) || (!!layout && editor.strategy.nodes[node.className].category === 'object' && (name === 'Position' || name === 'Rotation' || (name === 'Size' && layout.className === 'UIGridLayout')))} change={value => editor.editProperty(node.id, name, value)} />)}
    {node.imageAssetId && <div className="image-preview-tools"><p className="property-note">图片资产：{editor.imageAssets.find(a => a.id === node.imageAssetId)?.name ?? '资产库中缺失，使用已保存预览与 ID'}<br />实际 Roblox ID：{String(node.properties.Image) || '未配置'}</p>
      <button disabled={editor.runtime.active || !editor.imageAssets.some(a => a.id === node.imageAssetId)} onClick={() => window.dispatchEvent(new CustomEvent('uie:configure-asset', { detail: node.imageAssetId }))}>定位图片资产</button>
      <button disabled={editor.runtime.active} onClick={() => editor.editNode(node.id, current => { const { imageAssetId: _, ...rest } = current; return rest; }, '解除图片资产引用')}>解除资产引用</button></div>}
    {node.className.startsWith('Text') && <p className="property-note">字体使用本机替代字体预览，文字排版需在 Roblox 中确认。</p>}
    {node.className === 'UIGradient' && <p className="property-note">ColorStart/End 与 TransparencyStart/End 表示首尾两个关键点，后续导出对应 Roblox 序列。</p>}
    {node.className === 'CanvasGroup' && <p className="property-note">GroupColor3 使用浏览器颜色混合近似展示，最终颜色需在 Roblox 中确认。</p>}
    {node.className.startsWith('Image') && !node.imageAssetId && <div className="image-preview-tools"><p className="property-note">Image 保存 Roblox 资源 ID；本地图片仅用于预览，不会上传。</p><button disabled={editor.runtime.active} onClick={() => void editor.pickImage()}>选择预览图片</button>{node.previewImage ? <><p className="property-note">{node.previewImage.name}</p><button disabled={editor.runtime.active} onClick={() => editor.editNode(node.id, current => { const { previewImage: _, ...rest } = current; return rest; }, '清除预览图片')}>清除预览图片</button></> : <p className="property-note">缺少本地预览图片，画布显示占位。</p>}</div>}
  </fieldset>;
}
