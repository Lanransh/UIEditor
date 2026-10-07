import { useEffect, useRef, useState } from 'react';
import type { UIDocument } from '../shared/uiDocument';
import type { RobloxImportTask, ToolkitAPI, ToolkitTarget } from '../shared/toolkit';

declare global { interface Window { toolkit: ToolkitAPI } }
export function RobloxImportDialog({ document, onClose }: { document: UIDocument; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [snapshot] = useState(() => structuredClone(document));
  const [targets, setTargets] = useState<ToolkitTarget[]>([]);
  const [targetId, setTargetId] = useState('');
  const [task, setTask] = useState<RobloxImportTask | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function discover() {
    const result = await window.toolkit.discover();
    if (!result.ok) throw new Error(result.error);
    setTargets(result.value);
    setTargetId(current => result.value.some(target => target.id === current) ? current : result.value.length === 1 ? result.value[0].id : '');
    if (!result.value.length) throw new Error('请在 Toolkit 打开目标游戏工程，并在项目设置填写 PlaceId。');
  }
  useEffect(() => { dialog.current?.showModal(); void run(discover); }, []);
  useEffect(() => {
    if (task?.status !== 'awaiting_studio') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (!inFlight.current) {
        const result = await window.toolkit.task(targetId, task!.id, 'status').catch(cause => ({ ok: false as const, error: String(cause) }));
        if (cancelled) return;
        if (result.ok) { setTask(result.value); setError(''); } else setError(result.error);
      }
      if (!cancelled) timer = setTimeout(poll, 2000);
    }
    timer = setTimeout(poll, 2000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [task?.id, task?.status, targetId]);
  const waiting = task?.status === 'awaiting_studio';
  async function control(action: 'retry' | 'cancel') {
    if (!task) return;
    const result = await window.toolkit.task(targetId, task.id, action);
    if (!result.ok) throw new Error(result.error);
    setTask(result.value);
  }
  return <dialog ref={dialog} className="new-interface-dialog" aria-labelledby="roblox-import-title" onCancel={event => { if (busy || waiting) event.preventDefault(); else onClose(); }}>
    <h2 id="roblox-import-title">导入 Roblox</h2>
    <p>界面：{snapshot.root.name}。提交当前界面及交互脚本；接入脚本仅用于编辑器预览；导入后请在 Studio 保存场景。</p>
    <label>目标游戏工程<select aria-label="目标游戏工程" value={targetId} disabled={busy || !!task} onChange={event => setTargetId(event.target.value)}>
      <option value="">选择工程</option>{targets.map(target => <option key={target.id} value={target.id}>{target.name} · PlaceId {target.placeId}</option>)}
    </select></label>
    <p>交互类继承公共 CUIEditorUICompClass，公共类继承 FCUICompClass。生成脚本放在 Client/UI/Generated，游戏业务类与启动入口保持独立。</p>
    {task && <div className="new-interface-classes" role="status"><span>{task.message}</span><span>交互类：{task.sourceClass}</span><span>脚本：{task.scriptPath}</span></div>}
    {error && <p role="alert">{error}</p>}
    <div className="new-interface-actions">
      <button disabled={busy} onClick={() => void run(discover)}>刷新连接</button>
      {(waiting || task?.status === 'failed') && <button disabled={busy} onClick={() => void run(() => control('retry'))}>重新投递 UI</button>}
      {waiting ? <button disabled={busy} onClick={() => void run(() => control('cancel'))}>取消等待</button> : <button disabled={busy} onClick={onClose}>关闭</button>}
      {!task && <button disabled={busy || !targetId} onClick={() => void run(async () => {
        const result = await window.toolkit.submit(targetId, snapshot);
        if (!result.ok) throw new Error(result.error);
        setTask(result.value);
      })}>{busy ? '正在准备…' : '导入 UI 和脚本'}</button>}
    </div>
  </dialog>;
}
