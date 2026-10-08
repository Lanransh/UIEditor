import { useEffect, useRef, useState } from 'react';
import type { DocumentEditor } from './useDocumentEditor';
import { normalizeRobloxId, type ImageAsset } from '../shared/imageAssets';
import { ImageUploadDialog } from './ImageUploadDialog';

export function ImageAssets({ editor, library, selectedId, select }: {
  editor: DocumentEditor; library: string; selectedId: string | null; select(id: string): void;
}) {
  const [error, setError] = useState('');
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const menuElement = useRef<HTMLDivElement>(null);
  const scope = library === '永久图片' ? 'permanent' : 'project';
  const assets = editor.imageAssets.filter(a => a.library === scope);
  const asset = assets.find(a => a.id === menu?.id);
  useEffect(() => { setMenu(null); }, [library, editor.busy]);
  useEffect(() => {
    if (!menu) return;
    function dismiss(event: PointerEvent) {
      if (!menuElement.current?.contains(event.target as Node)) setMenu(null);
    }
    const close = () => setMenu(null);
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu]);
  async function openDirectory(id: string) {
    setMenu(null); setError('');
    try {
      const result = await window.imageAssets.openDirectory(id);
      if (!result.ok) setError(result.error);
    } catch (cause) { setError(String(cause)); }
  }
  return <div className="image-assets">
    <div className="image-asset-list">
      {error && <p role="alert" className="asset-error">{error}</p>}
      {editor.assetsLoading ? <p role="status">正在加载图片资产…</p> : <div className="asset-grid">
        {assets.map(a => <div key={a.id} className="image-asset-entry">
          <button className={`ui-asset${selectedId === a.id ? ' current' : ''}`} aria-label={`图片资产 ${a.name}`} aria-pressed={selectedId === a.id}
            draggable={!editor.busy} onDragStart={event => { event.dataTransfer.setData('application/x-uie-image-asset', a.id); event.dataTransfer.effectAllowed = 'copy'; }}
            onClick={() => { select(a.id); setMenu(null); }}
            onContextMenu={event => {
              event.preventDefault(); select(a.id);
              const bounds = event.currentTarget.getBoundingClientRect();
              setMenu({ id: a.id, x: Math.max(0, Math.min(event.clientX || bounds.left, window.innerWidth - 150)), y: Math.max(0, Math.min(event.clientY || bounds.bottom, window.innerHeight - 160)) });
            }}>
            <span className="ui-asset-preview image-checker"><img src={a.previewImage.dataUrl} alt="" /></span>
            <span className="ui-asset-name">{a.name}</span><small>{a.usage === 'placeholder' ? '占位图 · ' : ''}{a.robloxId ? '已配置 ID' : '仅本地'}</small>
          </button>
        </div>)}
      </div>}
      {!editor.assetsLoading && !assets.length && <p role="status">暂无{library}</p>}
      {menu && asset && <div ref={menuElement} className="asset-context-menu" role="menu" aria-label="图片资产操作" style={{ left: menu.x, top: menu.y }}
        onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setMenu(null); } }}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenu(null); }}>
        <button role="menuitem" autoFocus disabled={editor.busy} onClick={() => { setMenu(null); editor.useImage(asset); }}>应用到选中节点</button>
        <button role="menuitem" disabled={editor.busy} onClick={() => { setMenu(null); editor.useImage(asset, true); }}>插入图片节点</button>
        <button role="menuitem" disabled={editor.busy} onClick={() => void openDirectory(asset.id)}>打开目录</button>
        <button role="menuitem" disabled={!asset.robloxId} onClick={() => {
          setMenu(null);
          void navigator.clipboard.writeText(asset.robloxId).catch(cause => setError(String(cause)));
        }}>复制 ID</button>
      </div>}
    </div>
  </div>;
}

export function ImageAssetProperties({ editor, asset }: { editor: DocumentEditor; asset: ImageAsset }) {
  const [name, setName] = useState(asset.name), [tags, setTags] = useState(asset.tags);
  const [robloxId, setRobloxId] = useState(asset.robloxId);
  const [message, setMessage] = useState(''), [pending, setPending] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const previous = useRef(asset);
  useEffect(() => {
    const old = previous.current;
    const edited = name !== old.name || tags !== old.tags || robloxId !== old.robloxId;
    if (!edited || (name === asset.name && tags === asset.tags && robloxId === asset.robloxId)) {
      setName(asset.name); setTags(asset.tags); setRobloxId(asset.robloxId);
    } else setMessage('资产配置已在其他入口更新；当前未保存输入保留，请核对后保存。');
    previous.current = asset;
  }, [asset.name, asset.tags, asset.robloxId]);
  let effective = '', invalid = '';
  try { effective = normalizeRobloxId(robloxId); } catch (cause) { invalid = String(cause); }
  const changed = name !== asset.name || tags !== asset.tags || robloxId !== asset.robloxId;
  useEffect(() => { editor.setAssetConfigurationDirty(changed); return () => editor.setAssetConfigurationDirty(false); }, [changed, editor.setAssetConfigurationDirty]);
  async function save() {
    setPending(true); setMessage('');
    try {
      const assets = await editor.configureImage({ id: asset.id, name, tags, robloxId });
      const saved = assets.find(a => a.id === asset.id)!;
      setName(saved.name); setTags(saved.tags); setRobloxId(saved.robloxId); setMessage('配置已保存。');
    } catch (cause) { setMessage(String(cause)); } finally { setPending(false); }
  }
  return <form className="image-asset-properties editor-fields" aria-label="图片资产属性" onSubmit={event => { event.preventDefault(); void save(); }}>
    <fieldset disabled={editor.busy || pending || uploadOpen}>
      <div className="image-asset-config-preview image-checker"><img src={asset.previewImage.dataUrl} alt={`${asset.name}预览`} /></div>
      <div className="image-asset-config-fields">
        <label>名称<input aria-label="图片资产名称" maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>标签<input aria-label="图片资产标签" maxLength={500} value={tags} onChange={e => setTags(e.target.value)} /></label>
        <label>Roblox 资源 ID<input aria-label="Roblox 资源 ID" value={robloxId} onChange={e => setRobloxId(e.target.value)} placeholder="数字或 rbxassetid://…" /></label>
        <p className="property-note">{invalid || effective || '未配置，仅本地预览'}<br />{effective ? '已配置，Roblox 审核与游戏权限尚未验证。' : '可通过 Toolkit 上传，或手动填写图片资源 ID。'}</p>
        <div className="image-asset-actions"><button type="submit" disabled={!changed || !!invalid || !name.trim()}>保存配置</button>
          <button type="button" disabled={changed} onClick={() => setUploadOpen(true)}>{asset.robloxId ? '上传到 Roblox（替换 ID）' : '上传到 Roblox'}</button>
        </div>
        {changed && <p className="property-note">请先保存配置，再上传图片。</p>}
        {message && <p role="status">{message}</p>}
      </div>
    </fieldset>
    {uploadOpen && <ImageUploadDialog asset={asset} onClose={() => setUploadOpen(false)} saveId={async id => {
      await editor.configureImageRobloxId(asset.id, id);
      setRobloxId(id); setMessage('上传成功，ID 已自动保存。');
    }} />}
  </form>;
}
