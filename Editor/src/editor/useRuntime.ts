import { useEffect, useRef, useState } from 'react';
import type { UIDocument, JSONValue } from '../shared/uiDocument';
import { validateJSON, type RuntimeAPI, type RuntimeFrame, type RuntimeLog } from '../shared/runtime';

declare global { interface Window { runtime: RuntimeAPI } }
export function useRuntime(document: UIDocument) {
  const [active, setActive] = useState(false);
  const [frame, setFrame] = useState<RuntimeFrame | null>(null);
  const [logs, setLogs] = useState<RuntimeLog[]>([]);
  const session = useRef<string | null>(null);
  const generation = useRef(0);
  const snapshot = useRef<UIDocument | null>(null);
  function append(entries: RuntimeLog[]) { setLogs(value => [...value, ...entries].slice(-500)); }
  async function stop() {
    const token = ++generation.current;
    const id = session.current; session.current = null;
    setActive(false); setFrame(null);
    if (id) {
      try {
        const result = await window.runtime.stop(id);
        if (!result.ok && token === generation.current) append([{ kind: 'error', message: result.error }]);
      } catch (error) { if (token === generation.current) append([{ kind: 'error', message: String(error) }]); }
    }
  }
  async function start(source = document) {
    const token = ++generation.current;
    const previous = session.current; session.current = null;
    snapshot.current = structuredClone(source);
    setLogs([]); setActive(true); setFrame(null);
    try {
      if (previous) await window.runtime.stop(previous);
      if (token !== generation.current) return;
      const result = await window.runtime.start(source);
      if (token !== generation.current) { if (result.ok) await window.runtime.stop(result.value.session); return; }
      if (!result.ok) throw new Error(result.error);
      session.current = result.value.session;
      setFrame(result.value.frame); append(result.value.frame.logs);
    } catch (error) {
      if (token === generation.current) { setActive(false); setFrame(null); append([{ kind: 'error', message: String(error) }]); }
    }
  }
  async function command(input: { type: 'state'; state: JSONValue } | { type: 'event'; node: string }) {
    const id = session.current, token = generation.current;
    if (!id) return;
    try {
      const result = await window.runtime.command(id, input);
      if (token !== generation.current) return;
      if (!result.ok) throw new Error(result.error);
      setFrame(result.value); append(result.value.logs);
    } catch (error) {
      if (token === generation.current) {
        const stoppedAt = generation.current + 1;
        await stop();
        if (stoppedAt === generation.current) append([{ kind: 'error', message: String(error) }]);
      }
    }
  }
  async function applyState(source: string) {
    const state = validateJSON(JSON.parse(source));
    await command({ type: 'state', state });
  }
  useEffect(() => () => {
    ++generation.current;
    if (session.current) void window.runtime.stop(session.current);
    session.current = null;
  }, [document.id]);
  useEffect(() => window.runtime?.onEnded(event => {
    if (session.current !== event.session) return;
    ++generation.current; session.current = null;
    setActive(false); setFrame(null);
    append([{ kind: 'error', message: event.error }]);
  }), []);
  return { active, ready: !!frame, frame, logs, start: () => start(), stop, reset: () => start(snapshot.current ?? document), applyState, activate: (node: string) => command({ type: 'event', node }) };
}
