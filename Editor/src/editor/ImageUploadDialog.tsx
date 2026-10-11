import { useEffect, useRef, useState } from 'react';
import type { ImageUploadSource, ImageUploadTask, ToolkitTarget } from '../shared/toolkit';

export function ImageUploadDialog({ image, saveId, onClose, initialTargetId = '', onTargetSelected, onUploaded, batchProgress }: {
  image: ImageUploadSource; saveId(id: string): Promise<void>; onClose(): void;
  initialTargetId?: string; onTargetSelected?(id: string): void; onUploaded?(): void; batchProgress?: { current: number; total: number };
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const alive = useRef(true), inFlight = useRef(false);
  const [targets, setTargets] = useState<ToolkitTarget[]>([]);
  const [targetId, setTargetId] = useState(initialTargetId);
  const [needsSelection, setNeedsSelection] = useState(false);
  const [task, setTask] = useState<ImageUploadTask | null>(null);
  const [message, setMessage] = useState('正在识别同目录 Toolkit 工程…');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
  const completed = useRef(false);
  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  async function persist(id: string) {
    await saveId(id);
    if (alive.current) {
      setSaved(true); setMessage('上传成功，ID 已自动保存；目标游戏加载权限尚未验证。');
      if (!completed.current) { completed.current = true; onUploaded?.(); }
    }
  }
  async function accept(value: ImageUploadTask) {
    if (!alive.current) return;
    setTask(value); setMessage(value.message);
    if (value.status === 'succeeded') await persist(value.robloxId!);
  }
  async function submit(id: string) {
    const result = await window.toolkit.uploadImage(id, image);
    if (!result.ok) throw new Error(result.error);
    await accept(result.value);
  }
  async function discover() {
    const result = await window.toolkit.imageTargets();
    if (!result.ok) throw new Error(result.error);
    if (!alive.current) return;
    setTargets(result.value.targets);
    const id = targetId || result.value.automaticTargetId;
    if (id && !result.value.targets.some(target => target.id === id)) throw new Error('目标工程连接已失效，等待工程重新连接。');
    setTargetId(id); onTargetSelected?.(id); setNeedsSelection(!id);
    if (!result.value.targets.length) throw new Error('没有可用工程，请在 Toolkit 打开游戏工程并配置 PlaceId。');
    if (task) {
      if (['processing', 'waiting_review'].includes(task.status)) await query();
    } else if (id) {
      setMessage('已识别同目录 Toolkit 工程，正在提交图片…');
      await submit(id);
    } else {
      setMessage('未找到已运行的同目录 Toolkit 工程，请选择目标工程。');
    }
  }
  useEffect(() => {
    alive.current = true; dialog.current?.showModal(); void run(discover);
    return () => { alive.current = false; };
  }, []);
  async function query() {
    if (!task) return;
    const result = await window.toolkit.imageTask(targetId, task.taskId);
    if (!result.ok) throw new Error(result.error);
    await accept(result.value);
  }
  useEffect(() => {
    if (!task || !['processing', 'waiting_review'].includes(task.status) || error) return;
    const timer = setTimeout(() => void run(query), Math.min(task.pollAfterMs, 2147483647));
    return () => clearTimeout(timer);
  }, [task, targetId, error]);
  const waiting = !!task && ['processing', 'waiting_review'].includes(task.status);
  return <dialog ref={dialog} className="new-interface-dialog" aria-labelledby="image-upload-title"
    onCancel={event => { event.stopPropagation(); if (busy) event.preventDefault(); else onClose(); }}>
    <h2 id="image-upload-title">上传图片到 Roblox</h2>
    <p>图片：{image.name}。使用 Toolkit 工程的上传配置，单张最多 8 MiB；动画只上传第一帧。</p>
    {batchProgress && <p>批量上传 {batchProgress.current}/{batchProgress.total}</p>}
    {needsSelection && !task ? <label>目标游戏工程<select aria-label="图片上传目标工程" value={targetId}
      disabled={busy || !!task} onChange={event => { setTargetId(event.target.value); onTargetSelected?.(event.target.value); }}>
      <option value="">选择工程</option>{targets.map(target => <option key={target.id} value={target.id}>{target.name} · PlaceId {target.placeId}</option>)}
    </select></label> : targetId && <p>目标工程：{targets.find(target => target.id === targetId)?.name}</p>}
    {!error && <p role={task?.status === 'failed' ? 'alert' : 'status'}>{message}</p>}
    {task?.robloxId && <p>Roblox 资源 ID：{task.robloxId}</p>}
    {error && <p role="alert">{error}</p>}
    {waiting && <p>关闭后停止查询，不取消 Toolkit 已提交的上传；再次上传同一图片会复用已有操作。</p>}
    <div className="new-interface-actions">
      {!task && <button type="button" disabled={busy} onClick={() => void run(discover)}>刷新连接</button>}
      {(!task || task.status === 'failed') && <button type="button" disabled={busy || !targetId}
        onClick={() => void run(() => submit(targetId))}>{task ? '重试上传' : '上传图片'}</button>}
      {waiting && error && <button type="button" disabled={busy} onClick={() => void run(discover)}>继续查询</button>}
      {task?.status === 'succeeded' && !saved && <button type="button" disabled={busy}
        onClick={() => void run(() => persist(task.robloxId!))}>重试保存 ID</button>}
      <button type="button" disabled={busy} onClick={onClose}>关闭</button>
    </div>
  </dialog>;
}
