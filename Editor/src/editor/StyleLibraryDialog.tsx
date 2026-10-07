import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import type { TemplateStyle, TemplateStylePreview } from '../shared/project';
import type { UIDocument } from '../shared/uiDocument';
import { DocumentPreview } from './Canvas';
import { robloxStrategy } from './roblox';
import { stylePreviewBounds } from './stylePreview';

function StylePreview({ document, path }: { document: UIDocument; path: string }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const bounds = useMemo(() => stylePreviewBounds(document), [document]);
  function fit() {
    const area = viewport.current!;
    setZoom(Math.max(.1, Math.min(4, (area.clientWidth - 48) / bounds.width, (area.clientHeight - 48) / bounds.height)));
  }
  useEffect(() => {
    const observer = new ResizeObserver(fit);
    observer.observe(viewport.current!);
    return () => observer.disconnect();
  }, [bounds]);
  return <section className="style-preview" aria-label="画风模板预览">
    <div className="style-preview-toolbar"><strong title={path}>{path.replace(/\.rbxui\.json$/i, '')}</strong><div>
      <button onClick={fit}>适应窗口</button>
      <select aria-label="画风预览缩放" value={zoom} onChange={event => setZoom(Number(event.target.value))}>
        <option value={zoom}>{Math.round(zoom * 100)}%</option>
        {[.25, .5, 1, 2, 4].filter(value => value !== zoom).map(value => <option key={value} value={value}>{value * 100}%</option>)}
      </select>
    </div></div>
    <div className="style-preview-viewport" ref={viewport}>
      <div className="style-preview-frame" style={{ width: bounds.width * zoom, height: bounds.height * zoom }}>
        <div className="style-preview-artboard" data-testid="style-preview-artboard" data-document-id={document.id} style={{ left: -bounds.x * zoom, top: -bounds.y * zoom, transform: `scale(${zoom})` }}>
          <DocumentPreview document={document} strategy={robloxStrategy} />
        </div>
      </div>
    </div>
    <p>只读静态预览 · 聚焦组件范围 · 不执行交互脚本</p>
  </section>;
}

export function StyleLibraryDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [refresh, setRefresh] = useState(0);
  const [styles, setStyles] = useState<TemplateStyle[] | null>(null);
  const [styleId, setStyleId] = useState('');
  const [preview, setPreview] = useState<TemplateStylePreview | null>(null);
  const [templatePath, setTemplatePath] = useState('');
  const [listError, setListError] = useState('');
  const [previewError, setPreviewError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let active = true;
    setStyles(null); setPreview(null); setListError('');
    void window.projects.listStyles().then(result => {
      if (!active) return;
      if (!result.ok) { setListError(result.error); return; }
      setStyles(result.value);
      setStyleId(current => result.value.some(style => style.id === current) ? current : result.value[0]?.id ?? '');
    }).catch(() => { if (active) setListError('无法读取画风库，请重试。'); });
    return () => { active = false; };
  }, [refresh]);
  const selected = styles?.find(style => style.id === styleId);
  useEffect(() => {
    let active = true;
    setPreview(null); setPreviewError('');
    if (!selected || selected.problem) return;
    void window.projects.previewStyle(selected.id).then(result => {
      if (!active) return;
      if (!result.ok) { setPreviewError(result.error); return; }
      setPreview(result.value);
      setTemplatePath(current => result.value.templates.some(template => template.path === current) ? current : result.value.templates[0]?.path ?? '');
    }).catch(() => { if (active) setPreviewError('无法读取画风模板，请刷新重试。'); });
    return () => { active = false; };
  }, [selected]);
  const template = preview?.templates.find(template => template.path === templatePath);
  const loading = (!styles && !listError) || !!(selected && !selected.problem && !preview && !previewError);
  return <dialog ref={dialog} className="style-library-dialog" onCancel={onClose} aria-labelledby="style-library-title">
    <header className="style-library-header"><div><h2 id="style-library-title">画风库</h2><p>查看应用画风库的最新模板，无需创建工程。</p></div><div>
      <button disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={15} />刷新</button>
      <button autoFocus onClick={onClose} aria-label="关闭画风库"><X size={18} /></button>
    </div></header>
    <div className="style-library-body">
      <nav className="style-library-list" aria-label="画风列表">
        {!styles && !listError && <p role="status">正在读取画风库…</p>}
        {listError && <p role="alert">{listError}</p>}
        {styles?.length === 0 && <p>暂无画风。请在 TemplateStyles 中添加完整画风文件夹后刷新。</p>}
        {styles?.map(style => <button key={style.id} disabled={loading} aria-pressed={style.id === styleId} onClick={() => setStyleId(style.id)}>
          <span className="template-style-thumbnail ui-asset-preview ui-document-thumbnail" aria-hidden="true">
            {style.preview ? <span className="ui-thumbnail-artboard"><DocumentPreview document={style.preview} strategy={robloxStrategy} /></span> : <span className="ui-thumbnail-message">预览不可用</span>}
          </span>
          <strong>{style.name}</strong><small>{style.templateCount} 个模板</small><small>{style.problem ?? style.description}</small>
        </button>)}
      </nav>
      <nav className="style-library-templates" aria-label="画风模板列表">
        <h3>模板</h3>
        {selected?.problem && <p role="alert">{selected.problem}</p>}
        {previewError && <p role="alert">{previewError}</p>}
        {selected && !selected.problem && !preview && !previewError && <p role="status">正在读取模板…</p>}
        {preview?.templates.map(item => <button key={item.path} aria-pressed={item.path === templatePath} onClick={() => setTemplatePath(item.path)}>
          <strong title={item.path}>{item.path.replace(/\.rbxui\.json$/i, '')}</strong><small>{item.document.name} · {item.path}</small>
        </button>)}
      </nav>
      {template ? <StylePreview key={`${refresh}:${styleId}:${templatePath}`} document={template.document} path={template.path} /> : <div className="style-library-placeholder">选择画风与模板以查看预览</div>}
    </div>
    <footer className="style-library-footer">
      <span>来源：应用画风库{preview && <span className="style-library-path">{preview.directory}</span>}</span>
      <span>已有工程使用独立副本，不会随画风库更新。</span>
    </footer>
  </dialog>;
}
