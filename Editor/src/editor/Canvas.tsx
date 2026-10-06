import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { findParent, updateNode, type UIDocument, type UDim, type UDim2, type UINode, type Vector2 } from '../shared/uiDocument';
import type { DocumentEditor } from './useDocumentEditor';
import type { PreviewRect } from './strategy';
import { auxiliary, isObject, layoutComponent } from './roblox';
import { pixels } from './layout';

const rgba = (color: string, transparency: number) => `${color}${Math.round(255 * (1 - transparency)).toString(16).padStart(2, '0')}`;
interface Gesture {
  pointerId: number; x: number; y: number; kind: 'pan' | 'move' | 'resize';
  pan: { x: number; y: number }; node?: UINode; document: UIDocument; scale: number; rotation: number;
}
export function DocumentCanvas({ editor }: { editor: DocumentEditor }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(.5);
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const [draft, setDraft] = useState<UIDocument | null>(null);
  const draftRef = useRef<UIDocument | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const [space, setSpace] = useState(false);
  const shown = draft ?? editor.document;
  useEffect(() => {
    const down = (event: KeyboardEvent) => { if (event.code === 'Space' && event.target instanceof HTMLElement && !event.target.closest('input,textarea,select,button')) { event.preventDefault(); setSpace(true); } };
    const up = (event: KeyboardEvent) => { if (event.code === 'Space') setSpace(false); };
    const blur = () => { setSpace(false); gesture.current = null; draftRef.current = null; setDraft(null); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);
  function fit() {
    const area = viewport.current!;
    const scale = Math.max(.1, Math.min(2, (area.clientWidth - 48) / 1280, (area.clientHeight - 48) / 720));
    setZoom(scale); setPan({ x: (area.clientWidth - 1280 * scale) / 2, y: (area.clientHeight - 720 * scale) / 2 });
  }
  useEffect(() => { fit(); }, [editor.document.id]);
  function start(event: PointerEvent, kind: Gesture['kind'], node?: UINode) {
    if (editor.busy || gesture.current || ![0, 1].includes(event.button)) return;
    event.preventDefault(); event.stopPropagation();
    if (node) editor.select(node.id);
    const layout = node && layoutComponent(findParent(shown.root, node.id)!);
    if (layout && (kind === 'move' || (kind === 'resize' && layout.className === 'UIGridLayout'))) return;
    let scale = zoom, rotation = 0;
    if (node) {
      let ancestor = kind === 'resize' ? node : findParent(shown.root, node.id);
      while (ancestor && isObject(ancestor)) {
        scale *= (auxiliary(ancestor, 'UIScale')?.properties.Scale as number | undefined) ?? 1;
        rotation += ancestor.properties.Rotation as number;
        ancestor = findParent(shown.root, ancestor.id);
      }
    }
    gesture.current = { pointerId: event.pointerId, kind, x: event.clientX, y: event.clientY, pan, node, document: editor.document, scale, rotation };
    viewport.current!.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const dx = event.clientX - active.x, dy = event.clientY - active.y;
    if (active.kind === 'pan') { setPan({ x: active.pan.x + dx, y: active.pan.y + dy }); return; }
    const angle = active.rotation * Math.PI / 180;
    const localX = (dx * Math.cos(angle) + dy * Math.sin(angle)) / active.scale;
    const localY = (-dx * Math.sin(angle) + dy * Math.cos(angle)) / active.scale;
    const node = active.node!;
    const document = { ...active.document, root: updateNode(active.document.root, node.id, value => {
      const property = active.kind === 'move' ? 'Position' : 'Size';
      const dimensions = structuredClone(value.properties[property] as UDim2);
      const dx = Math.round(localX), dy = Math.round(localY);
      dimensions.x.offset += dx; dimensions.y.offset += dy;
      const properties = { ...value.properties, [property]: dimensions };
      if (active.kind === 'resize') {
        // Keep the rendered top-left corner fixed while dragging the bottom-right.
        const anchor = value.properties.AnchorPoint as Vector2;
        const ownScale = (auxiliary(value, 'UIScale')?.properties.Scale as number | undefined) ?? 1;
        const angle = (value.properties.Rotation as number) * Math.PI / 180;
        const position = structuredClone(value.properties.Position as UDim2);
        const halfX = dx * ownScale / 2, halfY = dy * ownScale / 2;
        position.x.offset += anchor.x * dx * ownScale - (1 - Math.cos(angle)) * halfX - Math.sin(angle) * halfY;
        position.y.offset += anchor.y * dy * ownScale + Math.sin(angle) * halfX - (1 - Math.cos(angle)) * halfY;
        properties.Position = position;
      }
      return { ...value, properties };
    }) };
    draftRef.current = document; setDraft(document);
  }
  function finish(event: PointerEvent, cancel = false) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (!cancel && draftRef.current && active.document === editor.document) {
      const result = draftRef.current;
      editor.execute(active.kind === 'resize' ? '调整节点尺寸' : '移动节点', () => result);
    }
    draftRef.current = null; setDraft(null);
    if (viewport.current?.hasPointerCapture(event.pointerId)) viewport.current.releasePointerCapture(event.pointerId);
  }
  function renderNode(node: UINode, rect: PreviewRect) {
    if (!node.properties.Visible) return null;
    const p = node.properties;
    const corner = auxiliary(node, 'UICorner')?.properties.CornerRadius as UDim | undefined;
    const stroke = auxiliary(node, 'UIStroke')?.properties;
    const gradient = auxiliary(node, 'UIGradient')?.properties;
    const selected = editor.selected.id === node.id || (editor.strategy.nodes[editor.selected.className].category === 'component' && findParent(shown.root, editor.selected.id)?.id === node.id);
    const resizeLocked = layoutComponent(findParent(shown.root, node.id)!)?.className === 'UIGridLayout';
    const radius = corner ? Math.max(0, pixels(corner, Math.min(rect.width, rect.height))) : 0;
    const style: CSSProperties = {
      position: 'absolute', left: rect.x, top: rect.y, width: rect.width, height: rect.height,
      transform: `translate(${rect.width * rect.scale / 2}px, ${rect.height * rect.scale / 2}px) rotate(${p.Rotation}deg) translate(${-rect.width * rect.scale / 2}px, ${-rect.height * rect.scale / 2}px) scale(${rect.scale})`, transformOrigin: '0 0',
      zIndex: p.ZIndex as number, borderRadius: radius,
      backgroundColor: rgba(p.BackgroundColor3 as string, p.BackgroundTransparency as number),
      outline: stroke?.Enabled ? `${stroke.Thickness}px solid ${rgba(stroke.Color as string, stroke.Transparency as number)}` : undefined,
      outlineOffset: stroke?.Enabled ? -(stroke.Thickness as number) / 2 : undefined,
      opacity: node.className === 'CanvasGroup' ? 1 - (p.GroupTransparency as number) : 1,
    };
    if (gradient?.Enabled) style.backgroundImage = `linear-gradient(${90 + (gradient.Rotation as number)}deg, ${rgba(gradient.ColorStart as string, gradient.TransparencyStart as number)}, ${rgba(gradient.ColorEnd as string, gradient.TransparencyEnd as number)})`;
    const scroll = node.className === 'ScrollingFrame';
    const canvas = p.CanvasSize as UDim2 | undefined;
    const contentWidth = scroll ? Math.max(rect.width, pixels(canvas!.x, rect.width)) : rect.width;
    const contentHeight = scroll ? Math.max(rect.height, pixels(canvas!.y, rect.height)) : rect.height;
    const childRects = editor.strategy.layout(node, contentWidth, contentHeight);
    const textSize = auxiliary(node, 'UITextSizeConstraint')?.properties;
    const fontSize = Math.min(textSize ? textSize.MaxTextSize as number : 100, Math.max(textSize ? textSize.MinTextSize as number : 1, p.TextScaled ? Math.min(rect.height * .7, rect.width / Math.max(1, String(p.Text).length) * 1.5) : p.TextSize as number));
    const contentStyle: CSSProperties = { position: 'absolute', inset: 0, overflow: scroll || p.ClipsDescendants || node.className === 'CanvasGroup' ? 'hidden' : 'visible', borderRadius: radius };
    return <div key={node.id} data-node-id={node.id} data-class-name={node.className} className="preview-node" style={style} onPointerDown={event => start(event, space || event.button === 1 ? 'pan' : 'move', space || event.button === 1 ? undefined : node)}>
      <div style={contentStyle}>
        {node.className.startsWith('Text') && <div className="preview-text" style={{ color: rgba(p.TextColor3 as string, p.TextTransparency as number), fontSize, fontFamily: p.Font === 'Arial' ? 'Arial, sans-serif' : p.Font === 'Gotham' ? 'Segoe UI, sans-serif' : 'Segoe UI, Microsoft YaHei, sans-serif', whiteSpace: p.TextWrapped ? 'pre-wrap' : 'pre', textAlign: String(p.TextXAlignment).toLowerCase() as CSSProperties['textAlign'], justifyContent: p.TextYAlignment === 'Top' ? 'flex-start' : p.TextYAlignment === 'Bottom' ? 'flex-end' : 'center' }}>{(p.Text as string) || (node.className === 'TextBox' ? p.PlaceholderText as string : '')}</div>}
        {node.className.startsWith('Image') && (node.previewImage ? <div className="preview-image" style={{ opacity: 1 - (p.ImageTransparency as number), backgroundImage: `url("${node.previewImage.dataUrl}")`, backgroundSize: p.ScaleType === 'Tile' ? 'auto' : p.ScaleType === 'Crop' ? 'cover' : p.ScaleType === 'Stretch' ? '100% 100%' : 'contain', backgroundRepeat: p.ScaleType === 'Tile' ? 'repeat' : 'no-repeat' }}><div style={{ position: 'absolute', inset: 0, backgroundColor: p.ImageColor3 as string, mixBlendMode: 'multiply' }} /></div> : <div className="preview-image-missing">▧<small>缺少预览图片</small></div>)}
        <div style={{ position: 'absolute', width: contentWidth, height: contentHeight, left: scroll ? -(p.CanvasPosition as Vector2).x : 0, top: scroll ? -(p.CanvasPosition as Vector2).y : 0 }}>
          {node.children.filter(isObject).map(child => renderNode(child, childRects.get(child.id)!))}
        </div>
        {scroll && contentHeight > rect.height && <div className="preview-scrollbar" style={{ width: p.ScrollBarThickness as number, height: Math.max(12, rect.height * rect.height / contentHeight) }} />}
        {node.className === 'CanvasGroup' && p.GroupColor3 !== '#ffffff' && <div style={{ position: 'absolute', inset: 0, backgroundColor: p.GroupColor3 as string, mixBlendMode: 'multiply', pointerEvents: 'none' }} />}
      </div>
      {selected && <div className="node-selection">{!resizeLocked && <button className="node-resize" aria-label="拖动调整尺寸" onPointerDown={event => start(event, 'resize', node)} />}</div>}
    </div>;
  }
  const rectangles = editor.strategy.layout(shown.root, 1280, 720);
  return <section className="canvas" aria-label="Roblox 画布">
    <div className="canvas-heading"><span>1280 × 720 · {editor.document.name}</span><div className="canvas-tools"><button disabled={editor.busy} onClick={fit}>适应窗口</button><select aria-label="画布缩放" value={zoom} onChange={event => setZoom(Number(event.target.value))}><option value={zoom}>{Math.round(zoom * 100)}%</option>{[.25, .5, .75, 1, 1.5, 2].filter(value => value !== zoom).map(value => <option key={value} value={value}>{value * 100}%</option>)}</select></div></div>
    <div ref={viewport} className={`canvas-viewport${space ? ' panning' : ''}`} onPointerDown={event => { if (event.button === 0 && !space) editor.select(shown.root.id); start(event, 'pan'); }} onPointerMove={move} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)} onWheel={event => {
      if (gesture.current) return;
      if (event.ctrlKey || event.metaKey) {
        const next = Math.max(.1, Math.min(3, zoom * (event.deltaY > 0 ? .9 : 1.1)));
        const bounds = viewport.current!.getBoundingClientRect(), x = event.clientX - bounds.left, y = event.clientY - bounds.top;
        setPan({ x: x - (x - pan.x) * next / zoom, y: y - (y - pan.y) * next / zoom }); setZoom(next);
      } else setPan({ x: pan.x - event.deltaX, y: pan.y - event.deltaY });
    }}>
      <div className="ui-artboard" data-testid="ui-artboard" style={{ width: 1280, height: 720, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        {shown.root.properties.Enabled && shown.root.children.filter(isObject).map(node => renderNode(node, rectangles.get(node.id)!))}
      </div>
      <div className="canvas-hint">空白处拖动 / 空格或中键平移 · Ctrl+滚轮缩放 · 静态设计</div>
    </div>
  </section>;
}
