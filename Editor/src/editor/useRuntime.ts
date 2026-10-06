import { useEffect, useRef, useState } from 'react';
import type { UIDocument } from '../shared/uiDocument';
import { type RuntimeAPI, type RuntimeFrame, type RuntimeLog } from '../shared/runtime';

declare global { interface Window { runtime: RuntimeAPI } }
export function useRuntime(document: UIDocument) {
  const [active, setActive] = useState(false);
  const [frame, setFrame] = useState<RuntimeFrame | null>(null);
  const [logs, setLogs] = useState<RuntimeLog[]>([]);
  const session = useRef<string | null>(null);
  const generation = useRef(0);
  const snapshot = useRef<UIDocument | null>(null);
  const current = useRef<{ frame: RuntimeFrame | null; logs: (RuntimeLog & { cursor: number })[]; cursor: number; sequence: number }>({ frame: null, logs: [], cursor: 0, sequence: 0 });
  function frameChanged(value: RuntimeFrame | null) { current.current.frame = value; ++current.current.sequence; setFrame(value); }
  function append(entries: RuntimeLog[]) { current.current.logs = [...current.current.logs, ...entries.map(log => ({ ...log, cursor: ++current.current.cursor }))].slice(-500); setLogs(current.current.logs); }
  async function stop() {
    const token = ++generation.current;
    const id = session.current; session.current = null;
    setActive(false); frameChanged(null);
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
    snapshot.current = structuredClone(source);
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
  async function command(input: { type: 'event'; node: string }) {
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
    ++generation.current; session.current = null;
    setActive(false); frameChanged(null);
    append([...(event.logs ?? []), { kind: 'error', message: event.error }]);
  }), []);
  return { active, ready: !!frame, frame, logs, start: (source = document) => start(source), stop, reset: () => start(snapshot.current ?? document), activate: (node: string) => command({ type: 'event', node }), inspect: () => ({ ...current.current, sessionId: session.current }) };
}
