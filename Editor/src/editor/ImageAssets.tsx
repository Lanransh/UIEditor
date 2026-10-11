import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DocumentEditor } from './useDocumentEditor';
import { normalizeRobloxId, type ImageAsset } from '../shared/imageAssets';
import { ImageUploadDialog } from './ImageUploadDialog';
import { ImageFolderDialog } from './ImageFolderDialog';
import { Folder } from 'lucide-react';
import { createPortal } from 'react-dom';

export function ImageAssets({ editor, library, selectedId, select }: {
  editor: DocumentEditor; library: string; selectedId: string | null; select(id: string): void;
}) {
  const [error, setError] = useState('');
  const [menu, setMenu] = useState<{ id: string | null; x: number; y: number } | null>(null);
  const [folder, setFolder] = useState(''), [folders, setFolders] = useState<string[]>([]);
  const [folderDialog, setFolderDialog] = useState<{ mode: 'create' | 'move'; id?: string } | null>(null);
  const menuElement = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const scope = library === '永久图片' ? 'permanent' : 'project';
  const assets = editor.imageAssets.filter(a => a.library === scope && (scope !== 'project' || (a.folder ?? '') === folder));
  const subfolders = folders.filter(path => path.startsWith(folder ? `${folder}/` : '') && !path.slice(folder ? folder.length + 1 : 0).includes('/'));
  const asset = assets.find(a => a.id === menu?.id);
  useEffect(() => { setMenu(null); }, [library, editor.busy]);
  useEffect(() => {
    setFolder(''); setMenu(null);
    setFolders([]);
    let alive = true;
    if (scope === 'project') void window.imageAssets.listFolders().then(result => {
      if (!alive) return;
      if (result.ok) setFolders(result.value); else setError(result.error);
    }).catch(cause => { if (alive) setError(String(cause)); });
    return () => { alive = false; };
  }, [scope]);
  useEffect(() => {
    if (scope !== 'project' || editor.inspectedAssetId !== selectedId) return;
    const selected = editor.imageAssets.find(asset => asset.id === selectedId && asset.library === 'project');
    if (selected) setFolder(selected.folder ?? '');
  }, [scope, selectedId, editor.inspectedAssetId]);
  useEffect(() => {
    const remove = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (scope === 'project' && assets.some(asset => asset.id === id) && !editor.busy) void removeImage(id);
    };
    window.addEventListener('uie:delete-image-asset', remove);
    return () => window.removeEventListener('uie:delete-image-asset', remove);
  }, [scope, assets, editor.busy]);
  async function removeImage(id: string) {
    setMenu(null); setError('');
    try { if (await editor.removeImage(id)) container.current?.focus(); }
    catch (cause) { setError(String(cause)); }
  }
  function openMenu(id: string | null, x: number, y: number) {
    setMenu({ id, x: Math.max(0, Math.min(x, window.innerWidth - 150)), y: Math.max(0, Math.min(y, window.innerHeight - 252)) });
  }
  useLayoutEffect(() => {
    if (!menu || !menuElement.current) return;
    const bounds = menuElement.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(menu.x, window.innerWidth - bounds.width));
    const y = Math.max(0, Math.min(menu.y, window.innerHeight - bounds.height));
    if (x !== menu.x || y !== menu.y) setMenu({ ...menu, x, y });
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    function dismiss(event: PointerEvent) {
      if (!menuElement.current?.contains(event.target as Node)) setMenu(null);
    }
    const close = () => setMenu(null);
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', close);
    window.addEventListener('wheel', close, true);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('resize', close);
      window.removeEventListener('wheel', close, true);
    };
  }, [menu]);
  async function openDirectory(id: string) {
    setMenu(null); setError('');
    try {
      const result = await window.imageAssets.openDirectory(id);
      if (!result.ok) setError(result.error);
    } catch (cause) { setError(String(cause)); }
  }
  async function importLocalImage() {
    setMenu(null); setError('');
    try {
      const imported = await editor.importImage(scope);
      if (imported) { setFolder(''); select(imported.id); }
    } catch (cause) { setError(String(cause)); }
  }
  return <div ref={container} tabIndex={-1} className="image-assets" onContextMenu={event => {
    if (scope !== 'project' || editor.busy || (event.target as HTMLElement).closest('button, [role="menu"], dialog')) return;
    event.preventDefault(); openMenu(null, event.clientX, event.clientY);
  }}>
    <div className="image-asset-list">
      <button disabled={editor.busy} onClick={() => void importLocalImage()} title={`导入到${library}，仅本地使用，不会上传 Roblox`}>导入本地图片</button>
      {scope === 'project' && <div className="image-folder-path">
        {folder && <button disabled={editor.busy} onClick={() => { if (editor.clearAssetInspection()) { setFolder(folder.split('/').slice(0, -1).join('/')); setMenu(null); } }}>返回上级</button>}
        <span>{folder || '项目图片根目录'}</span>
      </div>}
      {error && <p role="alert" className="asset-error">{error}</p>}
      {editor.assetsLoading ? <p role="status">正在加载图片资产…</p> : <div className="asset-grid">
        {scope === 'project' && subfolders.map(path => <button key={path} className="ui-asset image-folder" aria-label={`图片文件夹 ${path}`} disabled={editor.busy} onDoubleClick={() => {
          if (editor.clearAssetInspection()) { setFolder(path); setMenu(null); }
        }}><span className="ui-asset-preview"><Folder size={36} /></span><span className="ui-asset-name">{path.split('/').at(-1)}</span><small>双击打开</small></button>)}
        {assets.map(a => <div key={a.id} className="image-asset-entry">
          <button className={`ui-asset${selectedId === a.id ? ' current' : ''}`} disabled={editor.busy} aria-label={`图片资产 ${a.name}`} aria-pressed={selectedId === a.id}
            draggable={!editor.busy} onDragStart={event => { event.dataTransfer.setData('application/x-uie-image-asset', a.id); event.dataTransfer.effectAllowed = 'copy'; }}
            onClick={() => { select(a.id); setMenu(null); }}
            onContextMenu={event => {
              event.preventDefault(); event.stopPropagation();
              if (editor.busy || !editor.inspectAsset(a.id)) return;
              select(a.id);
              const bounds = event.currentTarget.getBoundingClientRect();
              openMenu(a.id, event.clientX || bounds.left, event.clientY || bounds.bottom);
            }}>
            <span className="ui-asset-preview image-checker"><img src={a.previewImage.dataUrl} alt="" /></span>
            <span className="ui-asset-name">{a.name}</span><small>{a.usage === 'placeholder' ? '占位图 · ' : ''}{a.robloxId ? '已配置 ID' : '仅本地'}</small>
          </button>
        </div>)}
      </div>}
      {!editor.assetsLoading && !assets.length && !subfolders.length && <p role="status">暂无{library}</p>}
      {menu && !menu.id && createPortal(<div ref={menuElement} className="asset-context-menu" role="menu" aria-label="项目图片目录操作" style={{ left: menu.x, top: menu.y, fontSize: 12 }}
        onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setMenu(null); } }}>
        <button role="menuitem" autoFocus onClick={() => { setMenu(null); setFolderDialog({ mode: 'create' }); }}>新建文件夹…</button>
      </div>, window.document.body)}
      {menu && asset && createPortal(<div ref={menuElement} className="asset-context-menu" role="menu" aria-label="图片资产操作" style={{ left: menu.x, top: menu.y, fontSize: 12 }}
        onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setMenu(null); } }}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenu(null); }}>
        <button role="menuitem" autoFocus disabled={editor.busy} onClick={() => { setMenu(null); editor.useImage(asset); }}>应用到选中节点</button>
        <button role="menuitem" disabled={editor.busy} onClick={() => { setMenu(null); editor.useImage(asset, true); }}>插入图片节点</button>
        <button role="menuitem" disabled={editor.busy} onClick={() => void openDirectory(asset.id)}>打开目录</button>
        <button role="menuitem" disabled={!asset.robloxId} onClick={() => {
          setMenu(null);
          void navigator.clipboard.writeText(asset.robloxId).catch(cause => setError(String(cause)));
        }}>复制 ID</button>
        {scope === 'project' && <>
          <button role="menuitem" disabled={editor.busy} onClick={() => { setMenu(null); setFolderDialog({ mode: 'move', id: asset.id }); }}>移动到文件夹…</button>
          <button role="menuitem" disabled={editor.busy} onClick={() => void removeImage(asset.id)}>删除图片…</button>
        </>}
      </div>, window.document.body)}
    </div>
    {folderDialog && <ImageFolderDialog mode={folderDialog.mode} folders={folders} current={folder} onClose={() => setFolderDialog(null)} onSubmit={async value => {
      if (folderDialog.mode === 'move') {
        if (!await editor.moveImage(folderDialog.id!, value)) throw new Error('移动已取消。');
        setFolder(value);
      }
      else {
        if (value.includes('/') || value.includes('\\')) throw new Error('文件夹名称不能包含路径。');
        const result = await window.imageAssets.createFolder(folder ? `${folder}/${value.trim()}` : value.trim());
        if (!result.ok) throw new Error(result.error);
        setFolders(result.value);
      }
    }} />}
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
    {uploadOpen && <ImageUploadDialog image={{ assetId: asset.id, name: asset.name }} onClose={() => setUploadOpen(false)} saveId={async id => {
      await editor.configureImageRobloxId(asset.id, id);
      setRobloxId(id); setMessage('上传成功，ID 已自动保存。');
    }} />}
  </form>;
}
