import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DocumentAsset, DocumentLibrary } from '../shared/documents';
import type { DocumentEditor } from './useDocumentEditor';
import type { UIDocument } from '../shared/uiDocument';
import { resolveImageAssets } from '../shared/imageAssets';
import { DocumentPreview } from './Canvas';

const libraryNames: Record<DocumentLibrary, string> = { permanent: '永久UI', project: '项目UI', templates: '模板参考' };

function DocumentThumbnail({ asset, editor, library }: { asset: { name: string; path: string | null }; editor: DocumentEditor; library: DocumentLibrary }) {
  const [saved, setSaved] = useState<UIDocument | null>(null);
  const [error, setError] = useState('');
  const current = asset.path === editor.path;
  useEffect(() => {
    if (current || !asset.path) return;
    let cancelled = false;
    setSaved(null); setError('');
    void window.documents.previewAsset(asset.path, library).then(result => {
      if (cancelled) return;
      if (result.ok) setSaved(result.value.document);
      else setError(result.error);
    }).catch(() => { if (!cancelled) setError('无法读取缩略图'); });
    return () => { cancelled = true; };
  }, [asset, current, library]);
  const document = useMemo(() => current ? editor.document : saved ? resolveImageAssets(saved, editor.imageAssets) : null, [current, editor.document, saved, editor.imageAssets]);
  return <span className="ui-asset-preview ui-document-thumbnail" role="img" aria-label={`${asset.name} 缩略图`} title={error || undefined}>
    {document ? <span className="ui-thumbnail-artboard" aria-hidden="true"><DocumentPreview document={document} strategy={editor.strategy} /></span>
      : <span className="ui-thumbnail-message">{error ? '预览不可用' : '加载中…'}</span>}
  </span>;
}

export function DocumentAssets({ editor, library }: { editor: DocumentEditor; library: string }) {
  const [assets, setAssets] = useState<DocumentAsset[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [folders, setFolders] = useState<string[]>([]);
  const [folder, setFolder] = useState('');
  const [creating, setCreating] = useState(false);
  const [folderName, setFolderName] = useState('');
  const folderDialog = useRef<HTMLDialogElement>(null);
  const [revision, refresh] = useState(0);
  const [menu, setMenu] = useState<{ path: string | null; x: number; y: number; moving?: boolean } | null>(null);
  const menuElement = useRef<HTMLDivElement>(null);
  const assetLibrary: DocumentLibrary = library === '模板参考' ? 'templates' : library === '永久UI' ? 'permanent' : 'project';
  useEffect(() => {
    setFolder(''); setCreating(false);
  }, [library]);
  useEffect(() => {
    if (creating) folderDialog.current?.showModal();
  }, [creating]);
  useEffect(() => {
    if (assetLibrary !== 'templates') return;
    let cancelled = false;
    void window.documents.listTemplateFolders().then(result => {
      if (cancelled) return;
      if (result.ok) setFolders(result.value); else setError(result.error);
    }).catch(cause => { if (!cancelled) setError(String(cause)); });
    return () => { cancelled = true; };
  }, [assetLibrary, revision, editor.busy]);

  useEffect(() => {
    if (editor.busy) return;
    let cancelled = false;
    setLoading(true); setAssets([]);
    void window.documents.listAssets(assetLibrary).then(result => {
      if (cancelled) return;
      if (result.ok) { setAssets(result.value); setError(''); }
      else setError(result.error);
    }).catch(() => { if (!cancelled) setError('无法读取界面资产，请重试。'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [editor.busy, editor.path, revision, library, assetLibrary]);

  useEffect(() => { setMenu(null); }, [library, editor.busy]);
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

  const visibleAssets = assetLibrary === 'templates' ? assets.filter(asset => {
    const parts = asset.path.replace(/\\/g, '/').split('/');
    const relative = parts.slice(parts.lastIndexOf('template-references') + 1);
    return folder ? relative.length > 1 && relative[0] === folder : relative.length === 1;
  }) : assets;
  const entries = assetLibrary === 'project' && !editor.path ? [{ name: editor.document.name, path: null }, ...visibleAssets] : visibleAssets;
  return <div className="document-assets" aria-label="UI 界面资产" aria-busy={loading || editor.busy}>
    {assetLibrary === 'templates' && <div className="document-asset-toolbar">
      <select aria-label="浏览模板文件夹" value={folder} onChange={event => setFolder(event.target.value)}><option value="">模板参考根目录</option>{folders.map(name => <option key={name}>{name}</option>)}</select>
      <button disabled={editor.busy} onClick={() => { setFolderName(''); setCreating(true); }}>＋ 新建文件夹</button>
    </div>}
    {creating && <dialog ref={folderDialog} className="new-interface-dialog" aria-label="新建模板文件夹" onCancel={() => setCreating(false)}>
      <form onSubmit={event => {
        event.preventDefault();
        void window.documents.createTemplateFolder(folderName.trim()).then(result => {
          if (!result.ok) { setError(result.error); return; }
          setFolder(folderName.trim()); setCreating(false); setError(''); refresh(value => value + 1);
        }).catch(cause => setError(String(cause)));
      }}>
        <h2>新建模板文件夹</h2><label>文件夹名称<input autoFocus aria-label="文件夹名称" value={folderName} onChange={event => setFolderName(event.target.value)} /></label>
        {error && <p role="alert">{error}</p>}
        <div className="new-interface-actions"><button type="button" onClick={() => setCreating(false)}>取消</button><button type="submit" disabled={!folderName.trim()}>创建</button></div>
      </form>
    </dialog>}
    {error && <div className="asset-error" role="alert">{error}<button disabled={editor.busy} onClick={() => refresh(value => value + 1)}>重试</button></div>}
    <div className="asset-grid">
      {entries.map(asset => <button key={asset.path ?? editor.document.id} className={`ui-asset${asset.path === editor.path ? ' current' : ''}`} disabled={editor.busy}
        aria-label={`UI 资产 ${asset.name}${asset.path ? '' : '（未保存）'}`} aria-current={asset.path === editor.path ? 'true' : undefined}
        title={asset.path ?? '当前界面尚未保存'} onMouseDown={event => { if (event.button === 2) event.preventDefault(); }} onContextMenu={event => {
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          const bounds = event.currentTarget.getBoundingClientRect();
          setMenu({ path: asset.path, x: Math.max(8, Math.min(event.clientX || bounds.left, window.innerWidth - 150)), y: Math.max(8, Math.min(event.clientY || bounds.bottom, window.innerHeight - 150)) });
        }}>
        <DocumentThumbnail asset={asset} editor={editor} library={assetLibrary} />
        <span className="ui-asset-name">{asset.name}</span>
        {!asset.path && <small>未保存</small>}
      </button>)}
    </div>
    {loading && <p role="status">正在加载界面资产…</p>}
    {!loading && !error && entries.length === 0 && <div className="assets-empty" role="status">暂无{library}</div>}
    {menu && createPortal(<div ref={menuElement} className="asset-context-menu" role="menu" aria-label={menu.moving ? '移动UI' : '界面资产操作'} style={{ left: menu.x, top: menu.y }}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setMenu(null); } }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenu(null); }}>
      {!menu.moving && <button role="menuitem" autoFocus disabled={editor.busy} onClick={() => {
        const path = menu.path;
        setMenu(null);
        if (path && assetLibrary !== 'project') void editor.openTemplate(path, assetLibrary);
        else if (path) void editor.openDocument(path);
        else void editor.saveProjectUI();
      }}>{menu.path ? assetLibrary !== 'project' ? '打开副本' : '打开' : '保存为项目UI'}</button>}
      {!menu.moving && <button role="menuitem" disabled={editor.busy || !menu.path} title={!menu.path ? '请先保存界面再移动' : undefined} onClick={() => setMenu({ ...menu, moving: true })}>移动</button>}
      {menu.moving && (Object.keys(libraryNames) as DocumentLibrary[]).filter(target => target !== assetLibrary).map((target, index) => <button key={target} role="menuitem" autoFocus={index === 0} disabled={editor.busy} onClick={() => {
        const path = menu.path;
        setMenu(null);
        if (path) void editor.moveAsset(path, assetLibrary, target);
      }}>{libraryNames[target]}</button>)}
      {menu.moving && <button role="menuitem" onClick={() => setMenu({ ...menu, moving: false })}>返回</button>}
    </div>, document.body)}
  </div>;
}
