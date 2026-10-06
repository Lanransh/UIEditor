import { useEffect, useRef } from 'react';
import type { DocumentEditor } from './useDocumentEditor';
import { getNode, findNodes, integer, type AutomationRequest } from '../shared/automation';
import { findNode, allNodes, type UIDocument } from '../shared/uiDocument';
import { getCapabilities } from './automationCapabilities';
import { documentCommand } from './commands';

interface Files { reset(document: UIDocument, path: string | null): void; saved(): string; markSaved(document: UIDocument, path: string): void; path(): string | null; busy(value: boolean): void }
export function useAutomation(editor: DocumentEditor, files: Files) {
  const sessionId = useRef(crypto.randomUUID());
  const current = useRef({ editor, files }); current.current = { editor, files };
  const lastError = useRef<string | null>(null);
  const documentId = useRef(editor.document.id);
  useEffect(() => {
    if (!window.automation) return;
    let alive = true;
    const unsubscribe = window.automation.onRequest(async (request: AutomationRequest) => {
      const { editor: e, files: f } = current.current;
      const a = request.arguments, h = e.history.inspect();
      if (documentId.current !== h.state.id) { documentId.current = h.state.id; sessionId.current = crypto.randomUUID(); }
      const stamp = () => ({ sessionId: sessionId.current, revision: e.history.inspect().revision });
      const verify = () => { if (!alive || a.sessionId !== sessionId.current || a.revision !== e.history.inspect().revision) throw new Error('编辑会话或 revision 已变化，请重新读取状态。'); };
      const writable = () => { verify(); if (e.runtime.inspect().sessionId || e.runtime.active || e.busy) throw new Error('当前正在运行或处理操作，请停止后编辑。'); };
      const dirty = () => JSON.stringify(e.history.inspect().state) !== f.saved();
      const relativePath = () => { const root = e.projectPath.replaceAll('\\', '/') + '/interfaces/', path = f.path()?.replaceAll('\\', '/'); return path?.toLowerCase().startsWith(root.toLowerCase()) ? path.slice(root.length) : null; };
      const state = () => ({ ...stamp(), projectType: e.strategy.mode, state: e.runtime.inspect().sessionId ? 'runtime' : 'edit', dirty: dirty(), relativePath: relativePath() });
      const readDocument = () => {
        if (a.view !== undefined && a.view !== 'design' && a.view !== 'runtime') throw new Error('view 必须是 design 或 runtime。');
        const runtime = e.runtime.inspect();
        if (a.view === 'runtime') { if (!runtime.sessionId || !runtime.frame) throw new Error('没有运行副本。'); return { document: runtime.frame.document, runtimeSessionId: runtime.sessionId, frameSequence: runtime.sequence }; }
        return { document: h.state };
      };
      try {
        switch (request.name) {
          case 'uie.editor.get_state': return { ...state(), ...(a.detail === 'full' ? { document: h.state } : { nodeCount: allNodes(h.state.root).length }) };
          case 'uie.editor.get_capabilities': return { ...stamp(), ...getCapabilities(e.strategy) };
          case 'uie.nodes.get': { const view = readDocument(); return { ...stamp(), ...('runtimeSessionId' in view ? { runtimeSessionId: view.runtimeSessionId, frameSequence: view.frameSequence } : {}), node: getNode(view.document, a) }; }
          case 'uie.nodes.find': { const view = readDocument(); return { ...stamp(), ...('runtimeSessionId' in view ? { runtimeSessionId: view.runtimeSessionId, frameSequence: view.frameSequence } : {}), ...findNodes(view.document, a) }; }
          case 'uie.code.execute': {
            writable(); if (a.dryRun !== undefined && typeof a.dryRun !== 'boolean') throw new Error('dryRun 必须是布尔值。');
            if (a.label !== undefined && (typeof a.label !== 'string' || a.label.length > 80)) throw new Error('label 最多 80 个字符。');
            f.busy(true);
            try {
              const result = await window.automation.invoke('code', { document: h.state, language: a.language, source: a.source }); verify();
              if (result.error) { lastError.current = result.error; return { ...stamp(), success: false, ...result }; }
              const before = JSON.stringify(h.state), after = JSON.stringify(result.document);
              if (!a.dryRun) e.history.execute(documentCommand(String(a.label ?? 'AI 执行代码'), () => result.document, e.strategy));
              return { ...stamp(), success: true, changed: before !== after, dryRun: !!a.dryRun, logs: result.logs, operationCount: result.operationCount, nodeCount: allNodes(result.document.root).length };
            } finally { f.busy(false); }
          }
          case 'uie.scripts.get': return { ...stamp(), scripts: a.kind === undefined ? h.state.scripts : { [String(a.kind)]: h.state.scripts[a.kind as 'source' | 'integration'] } };
          case 'uie.scripts.set': {
            writable();
            if (a.source === undefined && a.integration === undefined) throw new Error('必须提供交互代码或接入代码。');
            if (a.label !== undefined && (typeof a.label !== 'string' || a.label.length > 80)) throw new Error('label 最多 80 个字符。');
            const scripts = { ...h.state.scripts, ...(a.source !== undefined ? { source: a.source as string } : {}), ...(a.integration !== undefined ? { integration: a.integration as string } : {}) };
            const beforeRevision = h.revision;
            e.history.execute(documentCommand(String(a.label ?? 'AI 修改脚本'), value => ({ ...value, scripts }), e.strategy));
            return { ...state(), changed: e.history.inspect().revision !== beforeRevision };
          }
          case 'uie.document.list': return { ...stamp(), interfaces: await window.automation.invoke('file:list') };
          case 'uie.document.new': case 'uie.document.open': {
            writable(); if (dirty() && a.discardChanges !== true) throw new Error('当前界面未保存，请先保存或明确 discardChanges。');
            f.busy(true);
            try {
              const result = request.name.endsWith('new') ? { document: e.strategy.createDocument(String(a.name ?? '')), path: null } : await window.automation.invoke('file:open', a);
              verify(); if (request.name.endsWith('new')) await window.automation.invoke('file:new');
              f.reset(result.document, result.path); documentId.current = result.document.id; sessionId.current = crypto.randomUUID(); return state();
            } finally { f.busy(false); }
          }
          case 'uie.document.save': {
            writable(); f.busy(true);
            try { const result = await window.automation.invoke('file:save', { document: h.state, relativePath: a.relativePath }); verify(); f.markSaved(result.document, result.path); return state(); } finally { f.busy(false); }
          }
          case 'uie.runtime.control': {
            verify(); let result;
            if (a.action === 'stop') { result = await e.runtime.stop(); }
            else if (a.action === 'run') { writable(); result = await e.runtime.start(h.state); }
            else if (a.action === 'reset') { if (!e.runtime.inspect().sessionId) throw new Error('没有运行会话。'); result = await e.runtime.reset(); }
            else throw new Error('不支持的运行操作。');
            return { ...state(), result, runtimeSessionId: e.runtime.inspect().sessionId, frameSequence: e.runtime.inspect().sequence };
          }
          case 'uie.runtime.click': {
            verify(); const runtime = e.runtime.inspect(); if (!runtime.sessionId || !runtime.frame) throw new Error('没有运行会话。');
            const id = String(a.id), node = findNode(runtime.frame.document.root, id);
            if (!node || !e.strategy.automation.runtime.clickableNodeTypes.includes(node.className)) throw new Error('目标不是支持的按钮。');
            const visible = (node: import('../shared/uiDocument').UINode, shown: boolean): boolean => { const enabled = shown && (node.className === 'ScreenGui' ? !!node.properties.Enabled : node.properties.Visible !== false); return node.id === id ? enabled : node.children.some(child => visible(child, enabled)); };
            const reason = !visible(runtime.frame.document.root, true) ? 'hidden' : runtime.frame.disabled.includes(id) ? 'disabled' : null;
            const result = reason ? { ok: true, logs: [] } : await e.runtime.activate(id);
            return { ...stamp(), dispatched: !reason && !!result?.ok, reason, result, runtimeSessionId: e.runtime.inspect().sessionId, frameSequence: e.runtime.inspect().sequence };
          }
          case 'uie.debug.get_diagnostics': {
            const runtime = e.runtime.inspect(), cursor = integer(a.cursor, 0, 0, Number.MAX_SAFE_INTEGER);
            return { ...state(), connected: true, lastError: lastError.current, logs: runtime.logs.filter(log => log.cursor > cursor), cursor: runtime.cursor, truncated: cursor < (runtime.logs[0]?.cursor ?? runtime.cursor + 1) - 1 };
          }
          case 'uie.debug.screenshot': {
            window.dispatchEvent(new Event('uie:screenshot-start'));
            try {
              await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
              if (!alive) throw new Error('编辑会话已关闭。');
              const canvas = document.querySelector<HTMLElement>('.canvas-viewport'); if (!canvas) throw new Error('画布不可见。');
              const rect = canvas.getBoundingClientRect();
              return await window.automation.invoke('screenshot', { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, zoom: Number(canvas.dataset.zoom) });
            } finally { window.dispatchEvent(new Event('uie:screenshot-end')); }
          }
          default: throw new Error('不支持的工具。');
        }
      } catch (error) { lastError.current = String(error); throw error; }
    });
    return () => { alive = false; unsubscribe(); };
  }, []);
}
