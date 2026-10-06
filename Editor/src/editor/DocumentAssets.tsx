import { useEffect, useRef, useState } from 'react';
import { PanelTop } from 'lucide-react';
import type { DocumentAsset } from '../shared/documents';
import type { DocumentEditor } from './useDocumentEditor';

export function DocumentAssets({ editor, library }: { editor: DocumentEditor; library: string }) {
  const [assets, setAssets] = useState<DocumentAsset[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, refresh] = useState(0);
  const [menu, setMenu] = useState<{ path: string | null; x: number; y: number } | null>(null);
  const menuElement = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editor.busy) return;
    let cancelled = false;
    setLoading(true);
    void window.documents.listAssets().then(result => {
      if (cancelled) return;
      if (result.ok) { setAssets(result.value); setError(''); }
      else setError(result.error);
    }).catch(() => { if (!cancelled) setError('无法读取界面资产，请重试。'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [editor.busy, editor.path, revision]);

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

  if (library !== '项目资产') return <div className="assets-empty" role="status">暂无{library}</div>;
  const entries = editor.path ? assets : [{ name: editor.document.name, path: null }, ...assets];
  return <div className="document-assets" aria-label="UI 界面资产" aria-busy={loading || editor.busy}>
    {error && <div className="asset-error" role="alert">{error}<button disabled={editor.busy} onClick={() => refresh(value => value + 1)}>重试</button></div>}
    <div className="asset-grid">
      {entries.map(asset => <button key={asset.path ?? editor.document.id} className={`ui-asset${asset.path === editor.path ? ' current' : ''}`} disabled={editor.busy}
        aria-label={`UI 资产 ${asset.name}${asset.path ? '' : '（未保存）'}`} aria-current={asset.path === editor.path ? 'true' : undefined}
        title={asset.path ?? '当前界面尚未保存'} onContextMenu={event => {
          event.preventDefault();
          event.currentTarget.focus();
          const bounds = event.currentTarget.getBoundingClientRect();
          setMenu({ path: asset.path, x: Math.min(event.clientX || bounds.left, window.innerWidth - 150), y: Math.min(event.clientY || bounds.bottom, window.innerHeight - 50) });
        }}>
        <span className="ui-asset-preview"><PanelTop size={36} /></span>
        <span className="ui-asset-name">{asset.name}</span>
        {!asset.path && <small>未保存</small>}
      </button>)}
    </div>
    {loading && <p role="status">正在加载界面资产…</p>}
    {!loading && !error && entries.length === 0 && <div className="assets-empty" role="status">暂无项目资产</div>}
    {menu && <div ref={menuElement} className="asset-context-menu" role="menu" aria-label="界面资产操作" style={{ left: menu.x, top: menu.y }}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setMenu(null); } }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenu(null); }}>
      <button role="menuitem" autoFocus disabled={editor.busy} onClick={() => {
        const path = menu.path;
        setMenu(null);
        if (path) void editor.openDocument(path);
      }}>打开</button>
    </div>}
  </div>;
}
