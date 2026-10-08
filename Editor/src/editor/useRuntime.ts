import { RuntimeMouse } from './runtimeMouse';
import { robloxStrategy } from './roblox';
import type { MouseAction, Point } from '../shared/runtime-mouse';
import { useEffect, useRef, useState } from 'react';
import type { UIDocument, PropertyValue } from '../shared/uiDocument';
import { type RuntimeAPI, type RuntimeCommand, type RuntimeFrame, type RuntimeLog } from '../shared/runtime';

declare global { interface Window { runtime: RuntimeAPI } }
export function useRuntime(document: UIDocument) {
  const [active, setActive] = useState(false);
  const [frame, setFrame] = useState<RuntimeFrame | null>(null);
  const [logs, setLogs] = useState<RuntimeLog[]>([]);
  const session = useRef<string | null>(null);
  const generation = useRef(0);
  const snapshot = useRef<UIDocument | null>(null);
  const current = useRef<{ frame: RuntimeFrame | null; logs: (RuntimeLog & { cursor: number })[]; cursor: number; sequence: number }>({ frame: null, logs: [], cursor: 0, sequence: 0 });
  const inputGeneration = useRef<number | null>(null);
  const inputQueue = useRef<Promise<unknown>>(Promise.resolve());
  const mouse = useRef<RuntimeMouse | null>(null);
  if (!mouse.current) mouse.current = new RuntimeMouse(() => current.current.frame, async input => {
    if (inputGeneration.current !== generation.current) throw new Error('运行会话已变化。');
    const result = await command(input);
    if (!result?.ok) throw new Error(result?.error ?? '运行会话已变化。');
  }, robloxStrategy);
  function enqueue<T>(operation: () => Promise<T>) {
    const token = generation.current;
    const result = inputQueue.current.then(async () => {
      if (token !== generation.current || !session.current) return { ok: false, error: '运行会话已变化。' };
      inputGeneration.current = token;
      try { return { ok: true, ...await operation() }; }
      catch (error) { if (token === generation.current) append([{ kind: 'error', message: String(error) }]); return { ok: false, error: String(error) }; }
    });
    inputQueue.current = result;
    return result;
  }
  function frameChanged(value: RuntimeFrame | null) { current.current.frame = value; ++current.current.sequence; setFrame(value); }
  function append(entries: RuntimeLog[]) { current.current.logs = [...current.current.logs, ...entries.map(log => ({ ...log, cursor: ++current.current.cursor }))].slice(-500); setLogs(current.current.logs); }
  async function stop() {
    const token = ++generation.current;
    const id = session.current; session.current = null;
    mouse.current!.clear(); setActive(false); frameChanged(null);
    if (id) {
      try {
        const result = await window.runtime.stop(id);
        if (!result.ok && token === generation.current) { append([{ kind: 'error', message: result.error }]); return result; }
      } catch (error) { if (token === generation.current) append([{ kind: 'error', message: String(error) }]); return { ok: false, error: String(error) }; }
    }
    return { ok: true };
  }
  async function start(source = document) {
    const token = ++generation.current;
    const previous = session.current; session.current = null;
    mouse.current!.clear(); snapshot.current = structuredClone(source);
    current.current.logs = []; setLogs([]); setActive(true); frameChanged(null);
    try {
      if (previous) await window.runtime.stop(previous);
      if (token !== generation.current) return;
      const result = await window.runtime.start(source);
      if (token !== generation.current) { if (result.ok) await window.runtime.stop(result.value.session); return; }
      if (!result.ok) { append(result.logs ?? []); throw new Error(result.error); }
      session.current = result.value.session;
      frameChanged(result.value.frame); append(result.value.frame.logs);
      return { ok: true, sessionId: session.current, logs: result.value.frame.logs };
    } catch (error) {
      if (token === generation.current) { setActive(false); frameChanged(null); append([{ kind: 'error', message: String(error) }]); }
      return { ok: false, error: String(error) };
    }
  }
  async function command(input: RuntimeCommand) {
    const id = session.current, token = generation.current;
    if (!id) return { ok: false, error: '运行会话不存在。' };
    try {
      const result = await window.runtime.command(id, input);
      if (token !== generation.current) return;
      if (!result.ok) { append(result.logs ?? []); throw new Error(result.error); }
      frameChanged(result.value); append(result.value.logs);
      return { ok: true, logs: result.value.logs };
    } catch (error) {
      if (token === generation.current) {
        const stoppedAt = generation.current + 1;
        await stop();
        if (stoppedAt === generation.current) append([{ kind: 'error', message: String(error) }]);
      }
      return { ok: false, error: String(error) };
    }
  }
  useEffect(() => () => {
    ++generation.current;
    if (session.current) void window.runtime.stop(session.current);
    session.current = null;
  }, [document.id]);
  useEffect(() => window.runtime?.onEnded(event => {
    if (session.current !== event.session) return;
    ++generation.current; session.current = null; mouse.current!.clear();
    setActive(false); frameChanged(null);
    append([...(event.logs ?? []), { kind: 'error', message: event.error }]);
  }), []);
  return { active, ready: !!frame, frame, logs, start: (source = document) => start(source), stop, reset: () => start(snapshot.current ?? document), show: () => command({ type: 'show' }), hide: () => enqueue(async () => { await mouse.current!.cancel(); return await command({ type: 'hide' }); }), activate: (node: string) => enqueue(async () => { const result = await command({ type: 'event', node }); if (!result?.ok) throw new Error(result?.error ?? '运行会话已变化。'); append([{ kind: 'input', message: `click ${node}` }]); return result; }), setProperty: (node: string, property: string, value: PropertyValue) => command({ type: 'set', node, property, value }), mouse: (input: MouseAction) => enqueue(async () => {
    const result = await mouse.current!.perform(input);
    append([{ kind: 'input', message: JSON.stringify({ ...input, ...result }) }]);
    return result;
  }), pointer: (action: 'down' | 'move' | 'up' | 'cancel', id: string | null, point: Point, button = 0) => enqueue(async () => { await mouse.current!.pointer(action, id, point, button); }),
  wheel: (id: string, delta: Point) => enqueue(async () => { await mouse.current!.wheel(id, delta); }),
  cancelMouse: () => enqueue(async () => { await mouse.current!.cancel(); }),
  inspect: () => ({ ...current.current, sessionId: session.current, interaction: mouse.current!.inspect() }) };
}
