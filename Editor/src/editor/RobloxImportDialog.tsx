import { useEffect, useRef, useState } from 'react';
import type { UIDocument } from '../shared/uiDocument';
import type { ImageAsset } from '../shared/imageAssets';
import type { RobloxImportTask, ToolkitAPI, ToolkitTarget } from '../shared/toolkit';
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
  const [targets, setTargets] = useState<ToolkitTarget[]>([]);
  const [targetId, setTargetId] = useState('');
  const [task, setTask] = useState<RobloxImportTask | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadSession, setUploadSession] = useState<UploadSession | null>(null);
  const [uploadTargetId, setUploadTargetId] = useState('');
  const inFlight = useRef(false);
  const missingImages = findUnconfiguredRobloxImages(document, imageAssets);
  const imagesReady = missingImages.length === 0;

  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function discover() {
    const result = await window.toolkit.discover();
    if (!result.ok) throw new Error(result.error);
    if (task && !result.value.some(target => target.id === targetId)) throw new Error('目标工程连接已失效，请重新连接原工程。');
    setTargets(result.value);
    if (!task) setTargetId(current => result.value.some(target => target.id === current) ? current : result.value.length === 1 ? result.value[0].id : '');
    if (!result.value.length) throw new Error('请在 Toolkit 打开目标游戏工程，并在项目设置填写 PlaceId。');
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
      <p>以下图片没有 Roblox 资源 ID。先上传并保存 ID，之后才能继续导入。</p>
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
      <p>界面：{snapshot?.root.name ?? document.root.name}。提交当前界面及交互脚本；接入脚本仅用于编辑器预览；导入后请在 Studio 保存场景。</p>
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
        {!task && <button disabled={busy || !targetId} onClick={() => void run(submit)}>{busy ? '正在准备…' : '导入 UI 和脚本'}</button>}
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
