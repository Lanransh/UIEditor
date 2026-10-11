import { useEffect, useRef, useState } from 'react';
import type { UIDocument } from '../shared/uiDocument';
import type { ImageAsset } from '../shared/imageAssets';
import type { RobloxImportTask, ToolkitAPI } from '../shared/toolkit';
import { findUnconfiguredRobloxImages, type UnconfiguredRobloxImage } from '../shared/robloxImport';
import { ImageUploadDialog } from './ImageUploadDialog';

declare global { interface Window { toolkit: ToolkitAPI } }
interface UploadSession { mode: 'single' | 'all'; images: UnconfiguredRobloxImage[]; index: number }

export function RobloxImportDialog({ document, imageAssets, saveAssetId, assignNodeIds, onClose }: {
  document: UIDocument; imageAssets: ImageAsset[];
  saveAssetId(id: string, robloxId: string): Promise<void>;
  assignNodeIds(nodeIds: string[], robloxId: string): void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [snapshot, setSnapshot] = useState<UIDocument | null>(null);
  const [targetId, setTargetId] = useState('');
  const [task, setTask] = useState<RobloxImportTask | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadSession, setUploadSession] = useState<UploadSession | null>(null);
  const [uploadTargetId, setUploadTargetId] = useState('');
  const inFlight = useRef(false);
  const missingImages = findUnconfiguredRobloxImages(document, imageAssets);
  const imagesReady = missingImages.length === 0;
  const failure = error || (task?.status === 'failed' ? task.message : '');
  useEffect(() => {
    if (failure) console.error(`[Roblox Import] 界面：${snapshot?.root.name ?? document.root.name}；目标：${targetId || '未选择'}；${failure}`);
  }, [failure]);

  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function discover() {
    if (!task) setTargetId('');
    const result = await window.toolkit.discover();
    if (!result.ok) throw new Error(result.error);
    if (task && !result.value.some(target => target.id === targetId)) throw new Error('目标工程连接已失效，请重新连接原工程。');
    if (!result.value.length) throw new Error('请在 Toolkit 打开目标游戏工程，并在项目设置填写 PlaceId。');
    if (!task) {
      if (result.value.length !== 1) throw new Error('Toolkit 连接了多个游戏工程，请在 Toolkit 仅保留本次导入的工程连接。');
      setTargetId(result.value[0].id);
    }
  }
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => { if (imagesReady) void run(discover); }, [imagesReady]);
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
  const currentUpload = uploadSession?.images[uploadSession.index];
  function startSingle(image: UnconfiguredRobloxImage) { setUploadSession({ mode: 'single', images: [image], index: 0 }); }
  function startAll() { setUploadSession({ mode: 'all', images: missingImages, index: 0 }); }
  async function uploadSaved(image: UnconfiguredRobloxImage, robloxId: string) {
    if (image.assetId) await saveAssetId(image.assetId, robloxId);
    else assignNodeIds(image.nodeIds, robloxId);
  }
  function advanceBatch() {
    setUploadSession(current => current?.mode === 'all' && current.index + 1 < current.images.length
      ? { ...current, index: current.index + 1 } : null);
  }
  async function submit() {
    if (findUnconfiguredRobloxImages(document, imageAssets).length) throw new Error('请先上传所有未配置 Roblox ID 的图片。');
    const current = structuredClone(document);
    setSnapshot(current);
    const result = await window.toolkit.submit(targetId, current);
    if (!result.ok) throw new Error(result.error);
    setTask(result.value);
  }
  async function control(action: 'retry' | 'cancel') {
    if (!task) return;
    const result = await window.toolkit.task(targetId, task.id, action);
    if (!result.ok) throw new Error(result.error);
    setTask(result.value);
  }

  return <dialog ref={dialog} className="new-interface-dialog roblox-import-dialog" aria-labelledby="roblox-import-title" onCancel={event => { if (busy || waiting) event.preventDefault(); else onClose(); }}>
    <h2 id="roblox-import-title">导入 Roblox</h2>
    {!imagesReady ? <section className="roblox-import-images" aria-labelledby="roblox-import-images-title">
      <h3 id="roblox-import-images-title">有图片尚未上传，导入已暂停</h3>
      <div className="roblox-import-missing-list" role="list" aria-label="尚未上传的图片">
        {missingImages.map(image => <article key={image.key} className="roblox-import-missing-image" role="listitem">
          <img src={image.dataUrl} alt={`${image.name}预览`} />
          <div><strong>{image.name}</strong><small>{image.nodePaths.join('、')}</small><span>未上传</span></div>
          <button type="button" disabled={busy || !!uploadSession} aria-label={`上传 ${image.name}`} onClick={() => startSingle(image)}>上传</button>
        </article>)}
      </div>
      <div className="new-interface-actions">
        <button type="button" disabled={busy || !!uploadSession} onClick={startAll}>全部上传（{missingImages.length}）</button>
        <button type="button" disabled={busy || !!uploadSession} onClick={onClose}>取消导入</button>
      </div>
    </section> : <>
      <p>界面：{snapshot?.root.name ?? document.root.name}</p>
      {failure ? <div role="alert"><strong>导入失败</strong><span>{failure}</span></div>
        : task ? <div className={`import-result ${task.status}`} role="status"><span>{task.message}</span>{task.status === 'succeeded' && <span>请在 Studio 保存场景。</span>}</div>
        : busy && <p role="status">正在准备…</p>}
      <div className="new-interface-actions">
        {error && <button disabled={busy} onClick={() => void run(discover)}>刷新连接</button>}
        {(waiting || task?.status === 'failed') && <button disabled={busy} onClick={() => void run(() => control('retry'))}>重新投递 UI</button>}
        {waiting ? <button disabled={busy} onClick={() => void run(() => control('cancel'))}>取消等待</button> : <button disabled={busy} onClick={onClose}>关闭</button>}
        {!task && <button className="import-primary" disabled={busy || !targetId} onClick={() => void run(submit)}>{busy ? '正在准备…' : '导入 UI 和脚本'}</button>}
      </div>
    </>}
    {currentUpload && <ImageUploadDialog key={currentUpload.key} image={{
      ...(currentUpload.assetId ? { assetId: currentUpload.assetId, name: currentUpload.name } : { name: currentUpload.name, dataUrl: currentUpload.dataUrl }),
    }} initialTargetId={uploadTargetId} onTargetSelected={setUploadTargetId} saveId={id => uploadSaved(currentUpload, id)}
      onUploaded={uploadSession?.mode === 'all' ? advanceBatch : undefined}
      batchProgress={uploadSession?.mode === 'all' ? { current: uploadSession.index + 1, total: uploadSession.images.length } : undefined}
      onClose={() => setUploadSession(null)} />}
  </dialog>;
}
