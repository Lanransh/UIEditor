export interface Point { x: number; y: number }
export type MouseAction = { action: 'hover'; id: string | null } | { action: 'scroll'; id: string; to?: Partial<Point>; delta?: Partial<Point> } | { action: 'drag'; id: string; from: Point; to: Point; steps?: number };
export const pointSchema = { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, additionalProperties: false, minProperties: 1 };
export function validateMouseAction(value: Record<string, unknown>): asserts value is Record<string, unknown> & MouseAction {
  if (!['hover', 'scroll', 'drag'].includes(String(value.action))) throw new Error('不支持的鼠标动作。');
  if (!(value.action === 'hover' && value.id === null) && (typeof value.id !== 'string' || !value.id)) throw new Error('鼠标动作需要稳定节点 id。');
  const point = (v: unknown, normalized: boolean) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('坐标必须是对象。');
    const p = v as Record<string, unknown>, keys = Object.keys(p);
    if (!keys.length || keys.some(k => !['x', 'y'].includes(k)) || (normalized && keys.length !== 2)
      || Object.values(p).some(n => typeof n !== 'number' || !Number.isFinite(n) || (normalized && (n < 0 || n > 1)))) throw new Error('坐标无效；拖动坐标须在 0–1 范围。');
  };
  if (value.action === 'scroll') {
    if ((value.to === undefined) === (value.delta === undefined)) throw new Error('滚动必须且只能提供 to 或 delta。');
    point(value.to ?? value.delta, false);
  }
  if (value.action === 'drag') {
    point(value.from, true); point(value.to, true);
    if (value.steps !== undefined && (typeof value.steps !== 'number' || !Number.isInteger(value.steps) || value.steps < 1 || value.steps > 32)) throw new Error('拖动 steps 必须是 1–32。');
  }
}
