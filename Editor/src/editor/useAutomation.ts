import type { MouseAction } from '../shared/runtime-mouse';
import { useEffect, useRef } from 'react';
import type { DocumentEditor } from './useDocumentEditor';
import { getNode, nodeTree, findNodes, integer, type AutomationRequest } from '../shared/automation';
import { findNode, allNodes, type UIDocument } from '../shared/uiDocument';
import { getCapabilities } from './automationCapabilities';
import { documentCommand } from './commands';
import { resolveImageAssets } from '../shared/imageAssets';
import { executeRuntimeBatch } from '../shared/runtime-batch';

interface Files { reset(document: UIDocument, path: string | null): void; saved(): string; markSaved(document: UIDocument, path: string): void; path(): string | null; busy(value: boolean): void }
export function useAutomation(editor: DocumentEditor, files: Files) {
  const sessionId = useRef(crypto.randomUUID());
  const current = useRef({ editor, files }); current.current = { editor, files };
  const lastError = useRef<string | null>(null);
  const documentId = useRef(editor.document.id);
  const assetsSignature = useRef('');
  useEffect(() => {
    if (!window.automation) return;
    let alive = true;
    const handle = async (request: AutomationRequest): Promise<any> => {
      const { editor: e, files: f } = current.current;
      const a = request.arguments, h = e.history.inspect();
      const signature = JSON.stringify(e.imageAssets);
      if (assetsSignature.current !== signature) { assetsSignature.current = signature; sessionId.current = crypto.randomUUID(); }
      if (documentId.current !== h.state.id) { documentId.current = h.state.id; sessionId.current = crypto.randomUUID(); }
      const stamp = () => ({ sessionId: sessionId.current, revision: e.history.inspect().revision });
      const verify = () => { if (!alive || a.sessionId !== sessionId.current || a.revision !== e.history.inspect().revision || signature !== JSON.stringify(current.current.editor.imageAssets)) throw new Error('编辑会话、资产配置或 revision 已变化，请重新读取状态。'); };
      const writable = () => { verify(); if (e.runtime.inspect().sessionId || e.runtime.active || e.busy) throw new Error('当前正在运行或处理操作，请停止后编辑。'); };
      const resolved = () => resolveImageAssets(e.history.inspect().state, e.imageAssets);
      const dirty = () => e.hasDocument && JSON.stringify(resolved()) !== f.saved();
      const relativePath = () => { const root = e.projectPath.replaceAll('\\', '/') + '/interfaces/', path = f.path()?.replaceAll('\\', '/'); return path?.toLowerCase().startsWith(root.toLowerCase()) ? path.slice(root.length) : null; };
      const state = () => ({ ...stamp(), projectId: e.projectId, projectName: e.projectName, documentId: e.hasDocument ? e.history.inspect().state.id : null, projectType: e.strategy.mode, state: e.runtime.inspect().sessionId ? 'runtime' : 'edit', dirty: dirty(), relativePath: relativePath() });
      const readDocument = () => {
        if (a.view !== undefined && a.view !== 'design' && a.view !== 'runtime') throw new Error('view 必须是 design 或 runtime。');
        const runtime = e.runtime.inspect();
        if (a.view === 'runtime') { if (!runtime.sessionId || !runtime.frame) throw new Error('没有运行副本。'); return { document: runtime.frame.document, runtimeSessionId: runtime.sessionId, frameSequence: runtime.sequence }; }
        return { document: resolved() };
      };
      try {
        if (!e.hasDocument && !['uie.editor.get_state', 'uie.editor.get_capabilities', 'uie.document.list', 'uie.document.new', 'uie.document.open', 'uie.assets.search', 'uie.assets.get', 'uie.assets.configure', 'uie.debug.get_diagnostics'].includes(request.name)) throw new Error('请先新建或打开界面。');
        switch (request.name) {
          case 'uie.runtime.batch': return { ...await executeRuntimeBatch(a, handle, () => current.current.editor.runtime.inspect().frame, verify, () => current.current.editor.runtime.inspect().interaction), ...state() };
          case 'uie.editor.get_state': return { ...state(), ...(a.detail === 'full' ? { document: e.hasDocument ? resolved() : null } : { nodeCount: e.hasDocument ? allNodes(h.state.root).length : 0 }) };
          case 'uie.assets.search': case 'uie.assets.get': {
            const assets = await e.refreshImages();
            if (request.name === 'uie.assets.get') {
              const asset = assets.find(asset => asset.id === a.id && (a.library === undefined || asset.library === a.library)); if (!asset) throw new Error('图片资产不存在。');
              return { ...stamp(), asset: { ...asset, permission: 'unverified' } };
            }
            const query = String(a.query ?? '').toLowerCase();
            const matches = assets.filter(asset => (a.library === undefined || asset.library === a.library) && `${asset.name} ${asset.tags}`.toLowerCase().includes(query));
            const offset = integer(a.offset, 0, 0, 10000), limit = integer(a.limit, 50, 1, 200);
            return { ...stamp(), assets: matches.slice(offset, offset + limit).map(({ previewImage: _, ...asset }) => ({ ...asset })), total: matches.length, nextOffset: offset + limit < matches.length ? offset + limit : null };
          }
          case 'uie.assets.configure': {
            writable(); f.busy(true);
            try {
              const assets = await window.imageAssets.list(); if (!assets.ok) throw new Error(assets.error);
              const asset = assets.value.find(asset => asset.id === a.id); if (!asset) throw new Error('图片资产不存在。');
              verify();
              const result = await window.imageAssets.update({ id: asset.id, name: a.name === undefined ? asset.name : String(a.name), tags: a.tags === undefined ? asset.tags : String(a.tags), robloxId: a.robloxId === undefined ? asset.robloxId : String(a.robloxId) });
              if (!result.ok) throw new Error(result.error);
              await e.refreshImages();
              return { ...stamp(), saved: true, asset: result.value.find(asset => asset.id === a.id) };
            } finally { f.busy(false); }
          }
          case 'uie.editor.get_capabilities': return { ...stamp(), ...getCapabilities(e.strategy) };
          case 'uie.nodes.get': { const view = readDocument(); return { ...stamp(), ...('runtimeSessionId' in view ? { runtimeSessionId: view.runtimeSessionId, frameSequence: view.frameSequence, interaction: e.runtime.inspect().interaction } : {}), ...(a.format === 'tree' ? nodeTree(view.document, a) : { node: getNode(view.document, a) }) }; }
          case 'uie.nodes.find': { const view = readDocument(); return { ...stamp(), ...('runtimeSessionId' in view ? { runtimeSessionId: view.runtimeSessionId, frameSequence: view.frameSequence, interaction: e.runtime.inspect().interaction } : {}), ...findNodes(view.document, a) }; }
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
          case 'uie.document.list': return { ...stamp(), ...await window.automation.invoke('file:list', a) };
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
            try { const result = await window.automation.invoke('file:save', { document: resolved(), relativePath: a.relativePath }); verify(); f.markSaved(result.document, result.path); return state(); } finally { f.busy(false); }
          }
          case 'uie.runtime.control': {
            verify(); let result;
            if (a.action === 'stop') { result = await e.runtime.stop(); }
            else if (a.action === 'run') { writable(); result = await e.runtime.start(resolved()); }
            else if (a.action === 'reset') { if (!e.runtime.inspect().sessionId) throw new Error('没有运行会话。'); result = await e.runtime.reset(); }
            else throw new Error('不支持的运行操作。');
            return { ...state(), result, runtimeSessionId: e.runtime.inspect().sessionId, frameSequence: e.runtime.inspect().sequence };
          }
          case 'uie.runtime.hover': case 'uie.runtime.scroll': case 'uie.runtime.drag': {
            verify();
            const result = await e.runtime.mouse({ ...a, action: request.name.split('.').at(-1) } as MouseAction);
            verify();
            const runtime = e.runtime.inspect();
            return { ...stamp(), ...result, result, runtimeSessionId: runtime.sessionId, frameSequence: runtime.sequence, interaction: runtime.interaction };
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
            return { ...state(), connected: true, interaction: runtime.interaction, lastError: lastError.current, logs: runtime.logs.filter(log => log.cursor > cursor), cursor: runtime.cursor, truncated: cursor < (runtime.logs[0]?.cursor ?? runtime.cursor + 1) - 1 };
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
    };
    const unsubscribe = window.automation.onRequest(handle);
    return () => { alive = false; unsubscribe(); };
  }, []);
}
