import { findNode, findParent, type UINode, type UDim2, type Vector2 } from '../shared/uiDocument';
import type { RuntimeCommand, RuntimeFrame, MouseEventName, RuntimeInputMode } from '../shared/runtime';
import { type MouseAction, type Point, validateMouseAction } from '../shared/runtime-mouse';
import type { ProjectStrategy } from './strategy';
import { pixels } from './layout';
import { scrollGeometry } from './appearance';

type Matrix = [number, number, number, number, number, number];
const transform = (m: Matrix, p: Point): Point => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
export function localMousePoint(m: Matrix, p: Point): Point {
  const determinant = m[0] * m[3] - m[1] * m[2], x = p.x - m[4], y = p.y - m[5];
  return { x: (m[3] * x - m[2] * y) / determinant, y: (-m[1] * x + m[0] * y) / determinant };
}
const multiply = (a: Matrix, b: Matrix): Matrix => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
function visitGeometry(root: UINode, strategy: ProjectStrategy, visitNode: (node: UINode, width: number, height: number, matrix: Matrix, clip: string | null, visible: boolean, parentMatrix: Matrix) => boolean) {
  function visit(parent: UINode, width: number, height: number, matrix: Matrix, clip: string | null, visible: boolean): boolean {
    const rectangles = strategy.layout(parent, width, height);
    for (const node of parent.children.filter(n => strategy.nodes[n.className].category === 'object').sort((a, b) => Number(a.properties.ZIndex) - Number(b.properties.ZIndex))) {
      const r = rectangles.get(node.id)!;
      const a = Number(node.properties.Rotation) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), k = r.scale;
      const cx = r.width*k/2, cy = r.height*k/2;
      const m = multiply(matrix, [c*k, s*k, -s*k, c*k, r.x+cx-c*cx+s*cy, r.y+cy-s*cx-c*cy]);
      const shown = visible && node.properties.Visible !== false;
      if (visitNode(node, r.width, r.height, m, clip, shown, matrix)) return true;
      const canvas = node.properties.CanvasSize as UDim2 | undefined;
      const w = canvas ? Math.max(r.width, pixels(canvas.x, r.width)) : r.width, h = canvas ? Math.max(r.height, pixels(canvas.y, r.height)) : r.height;
      const pos = node.properties.CanvasPosition as Vector2 | undefined;
      const scroll = pos ? scrollGeometry(r.width, r.height, w, h, Number(node.properties.ScrollBarThickness), pos.x, pos.y, node.properties.ScrollingDirection as string) : { x: 0, y: 0 };
      const found = visit(node, w, h, multiply(m, [1, 0, 0, 1, -scroll.x, -scroll.y]),
        canvas || node.properties.ClipsDescendants || node.className === 'CanvasGroup' ? node.id : clip, shown);
      if (found) return true;
    }
    return false;
  }
  visit(root, 1280, 720, [1, 0, 0, 1, 0, 0], null, root.properties.Enabled === true);
}
export function runtimeGeometry(frame: RuntimeFrame, strategy: ProjectStrategy, id: string) {
  let result: { width: number; height: number; matrix: Matrix; parentMatrix: Matrix } | undefined;
  visitGeometry(frame.document.root, strategy, (node, width, height, matrix, _clip, _visible, parentMatrix) => {
    if (node.id !== id) return false;
    result = { width, height, matrix, parentMatrix };
    return true;
  });
  return result;
}

// Back-to-front paint order. Each clip points to an earlier clipping ancestor.
export function runtimeHitRegions(root: UINode, strategy: ProjectStrategy) {
  const regions: { id: string; width: number; height: number; matrix: Matrix; clip?: string }[] = [];
  visitGeometry(root, strategy, (node, width, height, matrix, clip, visible) => {
    if (visible) regions.push({ id: node.id, width, height, matrix, clip: clip ?? undefined });
    return false;
  });
  return regions;
}

export function movedPointer(start: Point, point: Point) {
  return Math.hypot(point.x - start.x, point.y - start.y) >= 3;
}

function scrollMetrics(node: UINode, width: number, height: number) {
  const p = node.properties, canvas = p.CanvasSize as UDim2, position = p.CanvasPosition as Vector2;
  return scrollGeometry(width, height, Math.max(width, pixels(canvas.x, width)), Math.max(height, pixels(canvas.y, height)), Number(p.ScrollBarThickness), position.x, position.y, p.ScrollingDirection as string);
}

type DetectorGesture = { detector: string; owner: string; start: Point; grabbed: Point; started: boolean; cancelled: boolean };
export class RuntimeMouse {
  private mode: RuntimeInputMode = 'pc';
  private hovered: string | null = null;
  private pressed: { id: string; button: number; point: Point; downTime: number; drag?: DetectorGesture; scroll?: { id: string; matrix: Matrix; start: Point; position: Vector2; moved: boolean } } | null = null;
  constructor(private frame: () => RuntimeFrame | null, private send: (command: RuntimeCommand) => Promise<unknown>, private strategy: ProjectStrategy) {}
  async setMode(mode: RuntimeInputMode) { await this.cancel(); this.mode = mode; }
  clear() { this.hovered = null; this.pressed = null; }
  inspect() {
    const frame = this.frame();
    return { hoveredId: frame && this.hovered && this.available(this.hovered) ? this.hovered : null, pressedId: frame && this.pressed && this.available(this.pressed.id) ? this.pressed.id : null };
  }
  private available(id: string) {
    const frame = this.frame();
    return !!frame && !!findNode(frame.document.root, id) && !this.target(id).reason;
  }
  private target(id: string) {
    const frame = this.frame();
    if (!frame) throw new Error('没有运行副本。');
    const node = findNode(frame.document.root, id);
    if (!node || this.strategy.nodes[node.className].category !== 'object') throw new Error('鼠标目标不是有效的运行节点。');
    const visible = (n: UINode, shown: boolean): boolean => {
      const enabled = shown && (n.className === 'ScreenGui' ? n.properties.Enabled === true : n.properties.Visible !== false);
      return n.id === id ? enabled : n.children.some(child => visible(child, enabled));
    };
    return { node, reason: !visible(frame.document.root, true) ? 'hidden' : frame.disabled.includes(id) ? 'disabled' : null };
  }
  private async emit(id: string, event: MouseEventName, point: Point, button = -1, delta: Point = { x: 0, y: 0 }, cancelled = false, wheel = false) {
    if (!this.frame() || !findNode(this.frame()!.document.root, id)) return;
    if (!['MouseLeave', 'InputEnded'].includes(event) && !this.available(id)) return;
    const listeners = this.frame()!.listeners;
    if (listeners && !listeners[id]?.includes(event)) return;
    await this.send({ type: 'mouse', node: id, event, x: point.x, y: point.y, dx: delta.x, dy: delta.y, button, cancelled, wheel, touch: this.mode === 'mobile' });
  }
  point(id: string, local: Point = { x: .5, y: .5 }) {
    const frame = this.frame();
    if (!frame) throw new Error('没有运行副本。');
    const r = runtimeGeometry(frame, this.strategy, id);
    if (!r) throw new Error('节点布局不存在。');
    return transform(r.matrix, { x: r.width * local.x, y: r.height * local.y });
  }
  async hover(id: string | null, point?: Point) {
    if (this.mode === 'mobile') return { dispatched: false, reason: 'touch-mode' };
    const reason = id ? this.target(id).reason : null;
    if (reason) id = null;
    const previous = this.hovered;
    this.hovered = id;
    if (previous !== id) {
      if (previous) await this.emit(previous, 'MouseLeave', point ?? { x: 0, y: 0 });
      if (id) await this.emit(id, 'MouseEnter', point ?? this.point(id));
    }
    return { dispatched: !reason, reason };
  }
  private detectorGesture(id: string, point: Point): DetectorGesture | undefined {
    const frame = this.frame()!;
    let owner = findNode(frame.document.root, id);
    while (owner) {
      const detector = owner.children.find(child => child.className === 'UIDragDetector' && child.properties.Enabled);
      const parent = findParent(frame.document.root, owner.id);
      if (detector && parent) {
        const geometry = runtimeGeometry(frame, this.strategy, owner.id)!;
        return { detector: detector.id, owner: owner.id, start: point, grabbed: localMousePoint(geometry.matrix, point), started: false, cancelled: false };
      }
      owner = parent ?? undefined;
    }
  }
  private async dragEvent(drag: DetectorGesture, event: 'DragStart' | 'DragContinue' | 'DragEnd', point: Point) {
    if (this.frame()?.listeners?.[drag.detector]?.includes(event))
      await this.send({ type: 'drag', node: drag.detector, event, ...point });
  }
  observeFrame() {
    const drag = this.pressed?.drag;
    if (!drag || drag.cancelled) return false;
    const owner = findNode(this.frame()!.document.root, drag.owner);
    drag.cancelled = !owner?.children.some(child => child.id === drag.detector && child.properties.Enabled) || !this.available(drag.owner);
    return drag.cancelled;
  }
  async cancelInvalidDetector() {
    if (this.pressed?.drag?.cancelled) await this.cancel();
  }
  private async alignDetector(drag: DetectorGesture, point: Point) {
    const frame = this.frame()!;
    const geometry = runtimeGeometry(frame, this.strategy, drag.owner);
    if (!geometry) return;
    const grabbed = localMousePoint(geometry.parentMatrix, transform(geometry.matrix, drag.grabbed));
    const target = localMousePoint(geometry.parentMatrix, point);
    const { x, y } = findNode(frame.document.root, drag.owner)!.properties.Position as UDim2;
    const dx = Math.round(target.x - grabbed.x), dy = Math.round(target.y - grabbed.y);
    if (dx || dy) await this.send({ type: 'set', node: drag.owner, property: 'Position', value: {
      x: { ...x, offset: x.offset + dx }, y: { ...y, offset: y.offset + dy },
    } });
  }
  private async moveDetector(drag: DetectorGesture, point: Point) {
    this.observeFrame();
    if (drag.cancelled) return;
    if (!drag.started) {
      if (!movedPointer(drag.start, point)) return;
      if (this.frame()?.listeners?.[drag.detector]?.includes('DragStart')) {
        const before = runtimeGeometry(this.frame()!, this.strategy, drag.owner)!;
        const anchor = transform(before.matrix, drag.grabbed);
        await this.dragEvent(drag, 'DragStart', drag.start);
        const after = runtimeGeometry(this.frame()!, this.strategy, drag.owner);
        if (!after) return;
        // DragStart can move the object to an overlay with a different coordinate system.
        drag.grabbed = localMousePoint(after.matrix, anchor);
      }
      drag.started = true;
      this.observeFrame();
      if (drag.cancelled) return;
    }
    await this.alignDetector(drag, point);
    this.observeFrame();
    if (!drag.cancelled) await this.dragEvent(drag, 'DragContinue', point);
  }
  async pointer(action: 'down' | 'move' | 'up' | 'cancel', id: string | null, point: Point, button = 0, time = performance.now(), scrollbarCaptured = false) {
    if (action === 'down') {
      if (!id || (this.mode === 'mobile' && button !== 0)) return;
      const reason = this.target(id).reason;
      if (reason) return;
      await this.hover(id, point);
      if (!this.available(id)) return;
      this.pressed = { id, button, point, downTime: time, drag: button === 0 && !scrollbarCaptured ? this.detectorGesture(id, point) : undefined };
      if (this.mode === 'mobile') {
        let node = findNode(this.frame()!.document.root, id);
        while (node && node.className !== 'ScrollingFrame') node = findParent(this.frame()!.document.root, node.id) ?? undefined;
        if (node && !this.target(node.id).reason) {
          const { matrix } = runtimeGeometry(this.frame()!, this.strategy, node.id)!;
          this.pressed.scroll = { id: node.id, matrix, start: localMousePoint(matrix, point), position: { ...node.properties.CanvasPosition as Vector2 }, moved: false };
        }
      }
      await this.emit(id, 'InputBegan', point, button);
    } else if (action === 'move') {
      const captured = this.pressed;
      if (this.mode === 'mobile' && !captured) return;
      if (!captured) await this.hover(id, point);
      const target = captured?.id ?? id;
      if (target) {
        // Once dragging, the detector's owner controls the gesture even if the hit child disappears.
        if (!captured?.drag?.started && !this.available(target)) { await this.cancel(); return; }
        if (this.mode === 'pc') await this.emit(target, 'MouseMoved', point);
        await this.emit(target, 'InputChanged', point, -1, captured ? { x: point.x-captured.point.x, y: point.y-captured.point.y } : { x: 0, y: 0 });
        if (captured?.drag && captured.scroll && movedPointer(captured.drag.start, point)) {
          const scroll = captured.scroll;
          const frame = this.frame()!;
          const geometry = runtimeGeometry(frame, this.strategy, scroll.id);
          let canScroll = false;
          if (geometry && time - captured.downTime < 350) {
            const g = scrollMetrics(findNode(frame.document.root, scroll.id)!, geometry.width, geometry.height);
            const local = localMousePoint(scroll.matrix, point);
            const dx = scroll.start.x - local.x, dy = scroll.start.y - local.y;
            canScroll = Math.abs(dx) > Math.abs(dy)
              ? (dx > 0 ? g.x < g.maxX : g.x > 0)
              : (dy > 0 ? g.y < g.maxY : g.y > 0);
          }
          if (canScroll) captured.drag = undefined;
          else captured.scroll = undefined;
        }
        if (captured?.drag && !captured.scroll) {
          await this.moveDetector(captured.drag, point);
          this.observeFrame();
          if (captured.drag.cancelled) { await this.cancel(); return; }
        }
        if (captured) captured.point = point;
        if (captured?.scroll && !captured.drag) {
          const scroll = captured.scroll, local = localMousePoint(scroll.matrix, point);
          scroll.moved ||= Math.hypot(local.x-scroll.start.x, local.y-scroll.start.y) > 6;
          if (scroll.moved) await this.scroll(scroll.id, { x: scroll.position.x+scroll.start.x-local.x, y: scroll.position.y+scroll.start.y-local.y });
        }
      }
    } else {
      const captured = this.pressed;
      this.observeFrame();
      if (captured?.drag?.started) {
        if (action === 'up' && !captured.drag.cancelled && (captured.point.x !== point.x || captured.point.y !== point.y)) await this.moveDetector(captured.drag, point);
        this.observeFrame();
        await this.dragEvent(captured.drag, 'DragEnd', action === 'cancel' || captured.drag.cancelled ? { x: -1, y: -1 } : point);
      }
      this.pressed = null;
      if (captured) await this.emit(captured.id, 'InputEnded', point, captured.button, { x: 0, y: 0 }, action === 'cancel' || captured.drag?.cancelled || !this.available(captured.id));
    }
  }
  async cancel() {
    const pressed = this.pressed;
    if (pressed) await this.pointer('cancel', null, pressed.point);
    await this.hover(null);
  }
  private async wheelEvents(id: string, delta: Point) {
    const events = this.frame()?.listeners?.[id] ?? [];
    if (this.frame()?.listeners && !events.some(event => ['MouseWheelForward', 'MouseWheelBackward', 'InputChanged'].includes(event))) return;
    const point = this.point(id);
    await this.emit(id, (delta.y || delta.x) < 0 ? 'MouseWheelForward' : 'MouseWheelBackward', point, -1, delta);
    await this.emit(id, 'InputChanged', point, -1, delta, false, true);
  }
  async scroll(id: string, to?: Partial<Point>, delta?: Partial<Point>) {
    const { node, reason } = this.target(id);
    if (node.className !== 'ScrollingFrame') throw new Error('滚动目标必须是 ScrollingFrame。');
    if (reason) return { dispatched: false, reason };
    if (delta) await this.wheelEvents(id, { x: delta.x ?? 0, y: delta.y ?? 0 });
    const current = this.target(id);
    if (current.reason) return { dispatched: false, reason: current.reason };
    const frame = this.frame()!, r = runtimeGeometry(frame, this.strategy, id)!;
    const position = current.node.properties.CanvasPosition as Vector2;
    const g = scrollMetrics(current.node, r.width, r.height);
    const next = { x: Math.trunc(Math.max(0, Math.min(g.maxX, to?.x ?? position.x + (delta?.x ?? 0)))), y: Math.trunc(Math.max(0, Math.min(g.maxY, to?.y ?? position.y + (delta?.y ?? 0)))) };
    if (next.x !== position.x || next.y !== position.y) {
      await this.send({ type: 'set', node: id, property: 'CanvasPosition', value: next });
      const captured = this.pressed;
      if (captured?.drag?.started && !this.observeFrame() && !captured.drag.cancelled)
        await this.alignDetector(captured.drag, captured.point);
    }
    return { dispatched: true, reason: null, position: findNode(this.frame()!.document.root, id)?.properties.CanvasPosition, range: { x: g.maxX, y: g.maxY } };
  }
  canMergeWheel(id: string) {
    const frame = this.frame();
    if (!frame?.listeners) return false;
    let node = findNode(frame.document.root, id);
    while (node) {
      const events = frame.listeners[node.id] ?? [];
      if (events.some(event => ['MouseWheelForward', 'MouseWheelBackward', 'InputChanged', 'property:CanvasPosition'].includes(event))) return false;
      if (node.className === 'ScrollingFrame') return true;
      node = findParent(frame.document.root, node.id) ?? undefined;
    }
    return false;
  }
  async wheel(id: string, delta: Point) {
    if (this.mode === 'mobile') return;
    const { node, reason } = this.target(id);
    if (reason) return;
    let scroll: UINode | undefined = node;
    while (scroll && scroll.className !== 'ScrollingFrame') scroll = findParent(this.frame()!.document.root, scroll.id) ?? undefined;
    if (scroll?.id !== id) await this.wheelEvents(id, delta);
    if (scroll) await this.scroll(scroll.id, undefined, delta);
  }
  async perform(input: MouseAction) {
    validateMouseAction(input);
    if (input.action === 'hover') return this.hover(input.id);
    if (input.action === 'scroll') return this.scroll(input.id, input.to, input.delta);
    const reason = this.target(input.id).reason;
    if (reason) return { dispatched: false, reason };
    const from = this.point(input.id, input.from), to = this.point(input.id, input.to), steps = input.steps ?? 8;
    const moveTime = input.holdMs ?? 0;
    await this.pointer('down', input.id, from, 0, 0);
    try {
      for (let i = 1; i <= steps && this.pressed; i++) await this.pointer('move', input.id, { x: from.x+(to.x-from.x)*i/steps, y: from.y+(to.y-from.y)*i/steps }, 0, moveTime);
      await this.pointer('up', input.id, to, 0, moveTime);
    } finally { if (this.pressed) await this.cancel(); }
    return { dispatched: true, reason: null };
  }
}
