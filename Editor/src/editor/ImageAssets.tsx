import { useEffect, useRef, useState } from 'react';
import type { DocumentEditor } from './useDocumentEditor';
import { normalizeRobloxId, type ImageAsset } from '../shared/imageAssets';

export function ImageAssets({ editor, library, selectedId, select }: {
  editor: DocumentEditor; library: string; selectedId: string | null; select(id: string): void;
}) {
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const scope = library === '永久图片' ? 'permanent' : 'project';
  const assets = editor.imageAssets.filter(a => a.library === scope && `${a.name} ${a.tags}`.toLowerCase().includes(query.toLowerCase()));
  const asset = assets.find(a => a.id === selectedId);
  useEffect(() => { setMenu(null); }, [library]);
  async function importImage(files?: File[]) {
    setPending(true); setError('');
    try {
      for (const file of files?.length ? files : [undefined]) {
        const asset = await editor.importImage(scope, file); if (asset) { setQuery(''); select(asset.id); }
      }
    }
    catch (cause) { setError(String(cause)); } finally { setPending(false); }
  }
  return <div className="image-assets" onDragOver={event => {
    if (!editor.busy && !pending && event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }
  }} onDrop={event => {
    if (editor.busy || pending || !event.dataTransfer.files.length) return;
    event.preventDefault(); void importImage(Array.from(event.dataTransfer.files));
  }}>
    <div className="image-asset-list">
      <div className="image-asset-toolbar"><input aria-label="搜索图片资产" placeholder="搜索名称或标签 · 拖入图片即可导入" value={query} onChange={event => setQuery(event.target.value)} />
        <button disabled={editor.busy || pending || editor.assetsLoading} onClick={() => void importImage()}>导入图片</button></div>
      {error && <p role="alert" className="asset-error">{error}</p>}
      {editor.assetsLoading ? <p role="status">正在加载图片资产…</p> : <div className="asset-grid">
        {assets.map(a => <div key={a.id} className="image-asset-entry">
          <button className={`ui-asset${selectedId === a.id ? ' current' : ''}`} aria-label={`图片资产 ${a.name}`} aria-pressed={selectedId === a.id}
            draggable={!editor.busy} onDragStart={event => { event.dataTransfer.setData('application/x-uie-image-asset', a.id); event.dataTransfer.effectAllowed = 'copy'; }}
            onClick={() => { select(a.id); setMenu(null); }}
            onContextMenu={event => { event.preventDefault(); select(a.id); setMenu(a.id); }}>
            <span className="ui-asset-preview image-checker"><img src={a.previewImage.dataUrl} alt="" /></span>
            <span className="ui-asset-name">{a.name}</span><small>{a.usage === 'placeholder' ? '占位图 · ' : ''}{a.robloxId ? '已配置 ID' : '仅本地'}</small>
          </button>
          {menu === a.id && <div className="image-asset-actions" onKeyDown={event => { if (event.key === 'Escape') setMenu(null); }}>
            <button disabled={!a.robloxId} onClick={() => {
              void navigator.clipboard.writeText(a.robloxId).then(() => setMenu(null)).catch(cause => setError(String(cause)));
            }}>复制资源 ID</button>
            <button disabled={editor.busy} onClick={() => { setMenu(null); editor.useImage(a); }}>应用图片</button>
          </div>}
        </div>)}
      </div>}
      {!editor.assetsLoading && !assets.length && <p role="status">暂无{library}{query ? '搜索结果' : ''}</p>}
      {asset && <div className="image-asset-actions">
        <button disabled={editor.busy} onClick={() => editor.useImage(asset)}>应用到选中节点</button>
        <button disabled={editor.busy} onClick={() => editor.useImage(asset, true)}>插入图片节点</button></div>}
    </div>
  </div>;
}

export function ImageAssetProperties({ editor, asset }: { editor: DocumentEditor; asset: ImageAsset }) {
  const [name, setName] = useState(asset.name), [tags, setTags] = useState(asset.tags);
  const [robloxId, setRobloxId] = useState(asset.robloxId);
  const [message, setMessage] = useState(''), [pending, setPending] = useState(false);
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
    <fieldset disabled={editor.busy || pending}>
      <div className="image-asset-config-preview image-checker"><img src={asset.previewImage.dataUrl} alt={`${asset.name}预览`} /></div>
      <div className="image-asset-config-fields">
        <label>名称<input aria-label="图片资产名称" maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>标签<input aria-label="图片资产标签" maxLength={500} value={tags} onChange={e => setTags(e.target.value)} /></label>
        <label>Roblox 资源 ID<input aria-label="Roblox 资源 ID" value={robloxId} onChange={e => setRobloxId(e.target.value)} placeholder="数字或 rbxassetid://…" /></label>
        <p className="property-note">{invalid || effective || '未配置，仅本地预览'}<br />{effective ? '已配置，Roblox 审核与游戏权限尚未验证。' : '不会自动上传；请上传后填写图片资源 ID。'}</p>
        <div className="image-asset-actions"><button type="submit" disabled={!changed || !!invalid || !name.trim()}>保存配置</button>
        </div>
        {message && <p role="status">{message}</p>}
      </div>
    </fieldset>
  </form>;
}
