import type { Point } from '../shared/runtime-mouse';

// Only merge work that has not started. Other inputs, direction changes and
// script listeners are barriers: their observable order must remain intact.
export class WheelInputBuffer {
  private pending: { id: string; delta: Point; result: Promise<unknown> } | null = null;
  seal() { this.pending = null; }
  push(id: string, delta: Point, merge: boolean, schedule: (run: () => Promise<void>) => Promise<unknown>, run: (delta: Point) => Promise<void>) {
    const previous = this.pending;
    if (merge && previous?.id === id && ['x', 'y'].every(axis => {
      const a = previous.delta[axis as keyof Point], b = delta[axis as keyof Point];
      return (!a || !b || Math.sign(a) === Math.sign(b)) && Number.isFinite(a + b);
    })) {
      previous.delta.x += delta.x; previous.delta.y += delta.y;
      return previous.result;
    }
    this.seal();
    const entry = { id, delta: { ...delta }, result: Promise.resolve<unknown>(undefined) };
    entry.result = schedule(async () => {
      if (this.pending === entry) this.seal();
      await run(entry.delta);
    });
    if (merge) this.pending = entry;
    return entry.result;
  }
}
