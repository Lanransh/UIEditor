import { runtimeGeometry, localMousePoint } from './runtimeMouse';
import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { findParent, updateNode, type UIDocument, type UDim, type UDim2, type UINode, type Vector2 } from '../shared/uiDocument';
import type { DocumentEditor } from './useDocumentEditor';
import type { PreviewRect, ProjectStrategy } from './strategy';
import { auxiliary, isObject, layoutComponent } from './roblox';
import { pixels } from './layout';
import { channels, gradientStyle, imageGradient, rgba, scrollGeometry } from './appearance';
import scrollTop from '../assets/roblox-scrollbars/scroll-top.png';
import scrollMiddle from '../assets/roblox-scrollbars/scroll-middle.png';
import scrollBottom from '../assets/roblox-scrollbars/scroll-bottom.png';
import { applyImageAsset } from '../shared/imageAssets';
import { insertNode } from './commands';

interface Gesture {
  pointerId: number; x: number; y: number; kind: 'pan' | 'move' | 'resize';
  pan: { x: number; y: number }; node?: UINode; document: UIDocument; scale: number; rotation: number;
}
export function DocumentCanvas({ editor, visible = true }: { editor: DocumentEditor; visible?: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(.5);
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const [draft, setDraft] = useState<UIDocument | null>(null);
  const draftRef = useRef<UIDocument | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const [space, setSpace] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const runtimeRef = useRef(editor.runtime); runtimeRef.current = editor.runtime;
  const editView = useRef<{ zoom: number; pan: { x: number; y: number } } | null>(null);
  const mouseGesture = useRef<{ pointerId: number; buttonId: string | null; button: number; startX: number; startY: number; moved: boolean; scroll?: { id: string; axis: 'x' | 'y'; position: number; ratio: number; start: number; matrix: NonNullable<ReturnType<typeof runtimeGeometry>>['matrix'] } } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    const active = mouseGesture.current;
    mouseGesture.current = null; suppressClick.current = true;
    if (active && viewport.current?.hasPointerCapture(active.pointerId)) viewport.current.releasePointerCapture(active.pointerId);
  }, [editor.runtime.inputMode]);
  useEffect(() => {
    const start = () => setCapturing(true), end = () => setCapturing(false);
    window.addEventListener('uie:screenshot-start', start); window.addEventListener('uie:screenshot-end', end);
    return () => { window.removeEventListener('uie:screenshot-start', start); window.removeEventListener('uie:screenshot-end', end); };
  }, []);
  const shown = editor.runtime.frame?.document ?? draft ?? editor.document;
  useEffect(() => {
    const down = (event: KeyboardEvent) => { if (!runtimeRef.current.active && event.code === 'Space' && event.target instanceof HTMLElement && !event.target.closest('input,textarea,select,button')) { event.preventDefault(); setSpace(true); } };
    const up = (event: KeyboardEvent) => { if (event.code === 'Space') setSpace(false); };
    const blur = () => { if (runtimeRef.current.active) void runtimeRef.current.cancelMouse(); mouseGesture.current = null; setSpace(false); gesture.current = null; draftRef.current = null; setDraft(null); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);
  function fit() {
    const area = viewport.current!;
    const scale = Math.max(editor.runtime.active ? .001 : .1, Math.min(editor.runtime.active ? Infinity : 2, (area.clientWidth - 48) / 1280, (area.clientHeight - 48) / 720));
    setZoom(scale); setPan({ x: (area.clientWidth - 1280 * scale) / 2, y: (area.clientHeight - 720 * scale) / 2 });
  }
  useEffect(() => { if (visible) fit(); }, [editor.document.id, visible]);
  useEffect(() => {
    if (!editor.runtime.active) {
      if (editView.current) { setZoom(editView.current.zoom); setPan(editView.current.pan); editView.current = null; }
      mouseGesture.current = null; return;
    }
    editView.current = { zoom, pan };
    setSpace(false); gesture.current = null; draftRef.current = null; setDraft(null);
    const area = viewport.current!;
    const preventWheelDefault = (event: WheelEvent) => event.preventDefault();
    area.addEventListener('wheel', preventWheelDefault, { passive: false });
    const observer = new ResizeObserver(fit);
    observer.observe(viewport.current!); fit();
    return () => { observer.disconnect(); area.removeEventListener('wheel', preventWheelDefault); };
  }, [editor.runtime.active]);
  function nodeId(target: EventTarget) { return (target as HTMLElement).closest<HTMLElement>('[data-node-id]')?.dataset.nodeId ?? null; }
  function point(event: PointerEvent) {
    const rect = viewport.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left - pan.x) / zoom, y: (event.clientY - rect.top - pan.y) / zoom };
  }
  function runtimeDown(event: PointerEvent) {
    if (!editor.runtime.ready || mouseGesture.current || ![0, 1, 2].includes(event.button) || (editor.runtime.inputMode === 'mobile' && event.button !== 0)) return;
    event.preventDefault();
    const id = nodeId(event.target), bar = (event.target as HTMLElement).closest<HTMLElement>('[data-scroll-axis]');
    suppressClick.current = false;
    const active: NonNullable<(typeof mouseGesture)['current']> = { pointerId: event.pointerId, buttonId: (event.target as HTMLElement).closest<HTMLElement>('[data-class-name="TextButton"], [data-class-name="ImageButton"]')?.dataset.nodeId ?? null, button: event.button, startX: event.clientX, startY: event.clientY, moved: false };
    if (bar && id && event.button === 0 && editor.runtime.inputMode === 'pc') {
      const axis = bar.dataset.scrollAxis as 'x' | 'y';
      const { matrix } = runtimeGeometry(editor.runtime.frame!, editor.strategy, id)!;
      active.scroll = { id, axis, matrix, start: localMousePoint(matrix, point(event))[axis], position: Number(bar.dataset.position), ratio: Number(bar.dataset.max) / Math.max(.001, Number(bar.dataset.travel)) };
    }
    mouseGesture.current = active;
    viewport.current!.setPointerCapture(event.pointerId);
    void editor.runtime.pointer('down', id, point(event), event.button);
  }
  function runtimeMove(event: PointerEvent) {
    const active = mouseGesture.current;
    if (active && active.pointerId !== event.pointerId) return;
    if (active) {
      active.moved ||= Math.hypot(event.clientX-active.startX, event.clientY-active.startY) > 3;
      suppressClick.current = active.moved;
      if (active.scroll) {
        const { id, axis, position, ratio, matrix, start } = active.scroll;
        void editor.runtime.mouse({ action: 'scroll', id, to: { [axis]: position + ((localMousePoint(matrix, point(event))[axis] - start) * ratio) } });
      }
    }
    void editor.runtime.pointer('move', nodeId(event.target), point(event), event.button);
  }
  function runtimeUp(event: PointerEvent, cancel = false) {
    const active = mouseGesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    mouseGesture.current = null;
    void editor.runtime.pointer(cancel ? 'cancel' : 'up', nodeId(event.target), point(event), event.button);
    if (viewport.current?.hasPointerCapture(event.pointerId)) viewport.current.releasePointerCapture(event.pointerId);
    const releasedButton = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-class-name="TextButton"], [data-class-name="ImageButton"]')?.dataset.nodeId;
    if (!cancel && !active.moved && !active.scroll && active.button === 0 && active.buttonId && active.buttonId === releasedButton) void editor.runtime.activate(active.buttonId);
  }
  function start(event: PointerEvent, kind: Gesture['kind'], node?: UINode) {
    if ((editor.busy && !editor.runtime.active) || editor.runtime.active || gesture.current || ![0, 1].includes(event.button)) return;
    event.preventDefault(); event.stopPropagation();
    if (node && editor.select(node.id) === false) return;
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
        position.x.offset = Math.round(position.x.offset + anchor.x * dx * ownScale - (1 - Math.cos(angle)) * halfX - Math.sin(angle) * halfY);
        position.y.offset = Math.round(position.y.offset + anchor.y * dy * ownScale + Math.sin(angle) * halfX - (1 - Math.cos(angle)) * halfY);
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
  return <section className="canvas" aria-label="Roblox 画布">
    <div className="canvas-heading"><span>1280 × 720 · {editor.document.name}</span><div className="canvas-tools"><button disabled={editor.busy || editor.runtime.active} onClick={fit}>适应窗口</button><select aria-label="画布缩放" disabled={editor.busy || editor.runtime.active} value={zoom} onChange={event => setZoom(Number(event.target.value))}><option value={zoom}>{Math.round(zoom * 100)}%</option>{[.25, .5, .75, 1, 1.5, 2].filter(value => value !== zoom).map(value => <option key={value} value={value}>{value * 100}%</option>)}</select></div></div>
    <div ref={viewport} data-zoom={zoom} className={`canvas-viewport${space ? ' panning' : ''}`} onDragOver={event => { if (!editor.busy && event.dataTransfer.types.includes('application/x-uie-image-asset')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }} onDrop={event => {
      if (editor.busy) return;
      const asset = editor.imageAssets.find(asset => asset.id === event.dataTransfer.getData('application/x-uie-image-asset'));
      if (!asset) return;
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect(), node = applyImageAsset(editor.strategy.createNode('ImageLabel'), asset);
      node.properties.Position = { x: { scale: 0, offset: Math.round((event.clientX - bounds.x - pan.x) / zoom) }, y: { scale: 0, offset: Math.round((event.clientY - bounds.y - pan.y) / zoom) } };
      editor.execute('拖入图片资产', document => insertNode(document, document.root.id, node, editor.strategy)); editor.select(node.id);
    }} onContextMenu={event => { if (editor.runtime.active) event.preventDefault(); }} onClickCapture={event => { if (editor.runtime.active && suppressClick.current) { event.preventDefault(); event.stopPropagation(); } }} onPointerLeave={() => { if (editor.runtime.active && !mouseGesture.current) void editor.runtime.mouse({ action: 'hover', id: null }); }} onPointerDown={event => { if (editor.runtime.active) { runtimeDown(event); return; } if (event.button === 0 && !space) editor.select(shown.root.id); start(event, 'pan'); }} onPointerMove={event => editor.runtime.active ? runtimeMove(event) : move(event)} onPointerUp={event => editor.runtime.active ? runtimeUp(event) : finish(event)} onPointerCancel={event => editor.runtime.active ? runtimeUp(event, true) : finish(event, true)} onLostPointerCapture={event => editor.runtime.active ? runtimeUp(event, true) : finish(event, true)} onWheel={event => {
      if (editor.runtime.active) {
        event.stopPropagation();
        const id = nodeId(event.target), unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 720 : 1;
        if (id) void editor.runtime.wheel(id, { x: event.deltaX * unit, y: event.deltaY * unit });
        return;
      }
      if (gesture.current) return;
      if (event.ctrlKey || event.metaKey) {
        const next = Math.max(.1, Math.min(3, zoom * (event.deltaY > 0 ? .9 : 1.1)));
        const bounds = viewport.current!.getBoundingClientRect(), x = event.clientX - bounds.left, y = event.clientY - bounds.top;
        setPan({ x: x - (x - pan.x) * next / zoom, y: y - (y - pan.y) * next / zoom }); setZoom(next);
      } else setPan({ x: pan.x - event.deltaX, y: pan.y - event.deltaY });
    }}>
      <div className="ui-artboard" data-testid="ui-artboard" style={{ width: 1280, height: 720, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        <DocumentPreview document={shown} strategy={editor.strategy} selected={!capturing && !editor.runtime.active ? editor.selected : undefined} runtime={editor.runtime}
          onNodePointerDown={(event, node) => { if (editor.runtime.active) return; start(event, space || event.button === 1 ? 'pan' : 'move', space || event.button === 1 ? undefined : node); }}
          onResize={(event, node) => start(event, 'resize', node)} />
      </div>
      {!capturing && <div className="canvas-hint">{editor.runtime.active ? editor.runtime.inputMode === 'mobile' ? '移动端模式 · 左键模拟单指点按 / 拖动内容 · 自动适应窗口' : 'PC 模式 · 滚轮 / 拖动滚动条 · 自动适应窗口' : '空白处拖动 / 空格或中键平移 · Ctrl+滚轮缩放 · 静态设计'}</div>}
    </div>
  </section>;
}

export function DocumentPreview({ document: shown, strategy, selected: selection, runtime, onNodePointerDown, onResize }: {
  document: UIDocument;
  strategy: ProjectStrategy;
  selected?: UINode;
  runtime?: Pick<DocumentEditor['runtime'], 'active' | 'frame' | 'activate'>;
  onNodePointerDown?: (event: PointerEvent, node: UINode) => void;
  onResize?: (event: PointerEvent, node: UINode) => void;
}) {
  const filterPrefix = useId();
  function renderNode(node: UINode, rect: PreviewRect) {
    if (!node.properties.Visible) return null;
    const p = node.properties;
    const corner = auxiliary(node, 'UICorner')?.properties.CornerRadius as UDim | undefined;
    const stroke = auxiliary(node, 'UIStroke')?.properties;
    const gradient = auxiliary(node, 'UIGradient')?.properties;
    const textNode = node.className.startsWith('Text');
    const selected = selection && (selection.id === node.id || (strategy.nodes[selection.className].category === 'component' && findParent(shown.root, selection.id)?.id === node.id));
    const resizeLocked = layoutComponent(findParent(shown.root, node.id)!)?.className === 'UIGridLayout';
    const radius = corner ? Math.max(0, pixels(corner, Math.min(rect.width, rect.height))) : 0;
    const style: CSSProperties = {
      position: 'absolute', left: rect.x, top: rect.y, width: rect.width, height: rect.height,
      transform: `translate(${rect.width * rect.scale / 2}px, ${rect.height * rect.scale / 2}px) rotate(${p.Rotation}deg) translate(${-rect.width * rect.scale / 2}px, ${-rect.height * rect.scale / 2}px) scale(${rect.scale})`, transformOrigin: '0 0',
      zIndex: p.ZIndex as number, borderRadius: radius,
      backgroundColor: gradient?.Enabled ? 'transparent' : rgba(p.BackgroundColor3 as string, p.BackgroundTransparency as number),
      outline: stroke?.Enabled && !textNode ? `${stroke.Thickness}px solid ${rgba(stroke.Color as string, stroke.Transparency as number)}` : undefined,
      opacity: node.className === 'CanvasGroup' ? 1 - (p.GroupTransparency as number) : 1,
    };
    const scroll = node.className === 'ScrollingFrame';
    const canvas = p.CanvasSize as UDim2 | undefined;
    const contentWidth = scroll ? Math.max(rect.width, pixels(canvas!.x, rect.width)) : rect.width;
    const contentHeight = scroll ? Math.max(rect.height, pixels(canvas!.y, rect.height)) : rect.height;
    const scrollPosition = scroll ? p.CanvasPosition as Vector2 : { x: 0, y: 0 };
    const scrollbar = scrollGeometry(rect.width, rect.height, contentWidth, contentHeight, scroll ? p.ScrollBarThickness as number : 0, scrollPosition.x, scrollPosition.y, p.ScrollingDirection as string);
    const childRects = strategy.layout(node, contentWidth, contentHeight);
    const textSize = p.TextScaled ? auxiliary(node, 'UITextSizeConstraint')?.properties : undefined;
    const fontSize = Math.min(textSize ? textSize.MaxTextSize as number : 100, Math.max(textSize ? textSize.MinTextSize as number : 1, p.TextScaled ? Math.min(rect.height * .7, rect.width / Math.max(1, String(p.Text).length) * 1.5) : p.TextSize as number));
    const contentStyle: CSSProperties = { position: 'absolute', inset: 0, overflow: scroll || p.ClipsDescendants || node.className === 'CanvasGroup' ? 'hidden' : 'visible' };
    const textStyle: CSSProperties = { fontSize, fontFamily: p.Font === 'Arial' ? 'Arial, sans-serif' : String(p.Font).startsWith('Gotham') ? 'Segoe UI, sans-serif' : 'Segoe UI, Microsoft YaHei, sans-serif', fontWeight: p.Font === 'GothamBold' ? 700 : undefined, whiteSpace: p.TextWrapped ? 'pre-wrap' : 'pre', textAlign: String(p.TextXAlignment).toLowerCase() as CSSProperties['textAlign'], justifyContent: p.TextYAlignment === 'Top' ? 'flex-start' : p.TextYAlignment === 'Bottom' ? 'flex-end' : 'center' };
    const tileSize = p.TileSize as UDim2 | undefined;
    const text = (p.Text as string) || (node.className === 'TextBox' ? p.PlaceholderText as string : '');
    const imageFilterId = `${filterPrefix}-image-${node.id}`;
    const tint = node.className.startsWith('Image') ? channels(p.ImageColor3 as string) : [1, 1, 1];
    const thickness = scroll ? p.ScrollBarThickness as number : 0;
    const scrollTexture = (length: number, horizontal = false) => <div style={{ position: 'absolute', width: thickness, height: length, top: horizontal ? thickness : 0, transform: horizontal ? 'rotate(-90deg)' : undefined, transformOrigin: '0 0', backgroundImage: `url("${scrollTop}"), url("${scrollBottom}"), url("${scrollMiddle}")`, backgroundSize: `100% ${thickness}px, 100% ${thickness}px, 100% ${Math.max(0, length - 2 * thickness)}px`, backgroundPosition: 'top, bottom, center', backgroundRepeat: 'no-repeat' }} />;
    const button = ['TextButton', 'ImageButton'].includes(node.className);
    const disabled = runtime?.frame?.disabled.includes(node.id);
    return <div key={node.id} data-node-id={runtime ? node.id : undefined} data-class-name={runtime ? node.className : undefined} className="preview-node" style={{ ...style, cursor: runtime?.active ? button ? disabled ? 'not-allowed' : 'pointer' : 'default' : undefined }}
      role={runtime?.active && button ? 'button' : undefined} aria-label={runtime?.active && button ? node.name : undefined} aria-disabled={runtime?.active && button ? disabled : undefined}
      onPointerDown={event => onNodePointerDown?.(event, node)}>
      <div style={contentStyle}>
        {gradient?.Enabled && <div className="preview-background" style={{ position: 'absolute', inset: 0, borderRadius: radius, pointerEvents: 'none', ...gradientStyle(gradient, p.BackgroundColor3 as string, p.BackgroundTransparency as number, rect.width, rect.height) }} />}
        {textNode && stroke?.Enabled && <div className="preview-text preview-text-stroke" style={{ ...textStyle, color: 'transparent', WebkitTextStroke: `${2 * (stroke.Thickness as number)}px ${rgba(stroke.Color as string, stroke.Transparency as number)}` }}>{text}</div>}
        {textNode && <div className="preview-text preview-text-fill" style={{ ...textStyle, color: rgba(p.TextColor3 as string, p.TextTransparency as number), ...(gradient?.Enabled ? { ...gradientStyle(gradient, p.TextColor3 as string, p.TextTransparency as number, rect.width, rect.height), backgroundClip: 'text', color: 'transparent' } : {}) }}>{text}</div>}
        {node.className.startsWith('Image') && (node.previewImage ? <>
          <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}><defs><filter id={imageFilterId} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
            <feColorMatrix type="matrix" values={`${tint[0]} 0 0 0 0 0 ${tint[1]} 0 0 0 0 0 ${tint[2]} 0 0 0 0 0 1 0`} result="tinted" />
            {gradient?.Enabled && <><feImage href={imageGradient(gradient, rect.width, rect.height)} result="gradient" preserveAspectRatio="none" /><feComposite in="tinted" in2="gradient" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" /></>}
          </filter></defs></svg>
          <div className="preview-image" style={{ borderRadius: radius, opacity: 1 - (p.ImageTransparency as number), filter: `url("#${imageFilterId}")`, backgroundImage: `url("${node.previewImage.dataUrl}")`, backgroundSize: p.ScaleType === 'Tile' ? `${Math.max(.01, pixels(tileSize!.x, rect.width))}px ${Math.max(.01, pixels(tileSize!.y, rect.height))}px` : p.ScaleType === 'Stretch' ? '100% 100%' : p.ScaleType === 'Crop' ? 'cover' : 'contain', backgroundPosition: p.ScaleType === 'Tile' ? 'left top' : undefined, backgroundRepeat: p.ScaleType === 'Tile' ? 'repeat' : 'no-repeat' }} />
        </> : <div className="preview-image-missing" style={{ borderRadius: radius }}>▧<small>缺少预览图片</small></div>)}
        {scroll && scrollbar.vertical && <div data-scroll-axis="y" data-position={scrollbar.y} data-max={scrollbar.maxY} data-travel={scrollbar.windowHeight-scrollbar.thumbHeight} className="preview-scrollbar vertical" style={{ pointerEvents: runtime?.active ? 'auto' : undefined, zIndex: 10000, width: thickness, height: scrollbar.thumbHeight, top: scrollbar.top }}>{scrollTexture(scrollbar.thumbHeight)}</div>}
        {scroll && scrollbar.horizontal && <div data-scroll-axis="x" data-position={scrollbar.x} data-max={scrollbar.maxX} data-travel={scrollbar.windowWidth-scrollbar.thumbWidth} className="preview-scrollbar horizontal" style={{ pointerEvents: runtime?.active ? 'auto' : undefined, zIndex: 10000, height: thickness, width: scrollbar.thumbWidth, left: scrollbar.left }}>{scrollTexture(scrollbar.thumbWidth, true)}</div>}
        <div style={{ position: 'absolute', width: contentWidth, height: contentHeight, left: scroll ? -scrollbar.x : 0, top: scroll ? -scrollbar.y : 0 }}>
          {node.children.filter(isObject).map(child => renderNode(child, childRects.get(child.id)!))}
        </div>
        {node.className === 'CanvasGroup' && p.GroupColor3 !== '#ffffff' && <div style={{ position: 'absolute', inset: 0, backgroundColor: p.GroupColor3 as string, mixBlendMode: 'multiply', pointerEvents: 'none' }} />}
      </div>
      {selected && <div className="node-selection">{!resizeLocked && <button className="node-resize" aria-label="拖动调整尺寸" onPointerDown={event => onResize?.(event, node)} />}</div>}
    </div>;
  }
  const rectangles = strategy.layout(shown.root, 1280, 720);
  return <>{shown.root.properties.Enabled && shown.root.children.filter(isObject).map(node => renderNode(node, rectangles.get(node.id)!))}</>;
}
