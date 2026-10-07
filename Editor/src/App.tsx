import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Clock3, Folder, FolderOpen, FolderPlus, Layers3, Settings, Trash2 } from 'lucide-react';
import type { Project, ProjectAPI, RecentProjectView, Result } from './shared/project';
import { useDocumentEditor } from './editor/useDocumentEditor';
import { NodeTree, NodeProperties } from './editor/NodePanels';
import { DocumentCanvas } from './editor/Canvas';
import { DocumentAssets } from './editor/DocumentAssets';
import { ImageAssets, ImageAssetProperties } from './editor/ImageAssets';
import { ScriptPanel, RuntimeOutput } from './editor/ScriptPanel';
import { NewInterfaceDialog } from './editor/NewInterfaceDialog';
import { RobloxImportDialog } from './editor/RobloxImportDialog';
import { McpSettings } from './editor/McpSettings';

declare global { interface Window { projects: ProjectAPI } }

export function App() {
  const [project, setProject] = useState<Project | null>(null);
  useEffect(() => window.projects.onActivated(setProject), []);
  useEffect(() => { document.title = project ? `${project.name} · Roblox — UI 编辑器` : 'UI 编辑器'; }, [project]);
  return project ? <Workspace key={project.path} project={project} onBack={() => setProject(null)} /> : <ProjectHub onOpen={setProject} />;
}

function ProjectHub({ onOpen }: { onOpen: (project: Project) => void }) {
  const [mcpSettings, setMcpSettings] = useState(false);
  const [recent, setRecent] = useState<RecentProjectView[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);

  async function load() {
    setBusy(true);
    setError('');
    try {
      const startup = await window.projects.openStartup();
      if (!startup.ok) { setError(startup.error); }
      else if (startup.value) { onOpen(startup.value); return; }
      const result = await window.projects.listRecent();
      if (result.ok) setRecent(result.value); else setError(result.error);
    } catch { setError('无法读取工程历史，请重试。'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);

  async function open(action: () => Promise<Result<Project | null>>) {
    setBusy(true);
    setError('');
    try {
      const result = await action();
      if (result.ok) { if (result.value) onOpen(result.value); }
      else {
        setError(result.error);
        const history = await window.projects.listRecent();
        if (history.ok) setRecent(history.value);
      }
    } catch { setError('操作未完成，请重试。'); }
    finally { setBusy(false); }
  }

  async function remove(path: string) {
    setBusy(true);
    setError('');
    try {
      const result = await window.projects.removeRecent(path);
      if (result.ok) setRecent(result.value); else setError(result.error);
    } catch { setError('无法移出工程记录，请重试。'); }
    finally { setBusy(false); }
  }

  function section(title: string, icon: ReactNode, entries: RecentProjectView[], empty: string) {
    return <section className="hub-section" aria-label={title}>
      <h2>{icon}{title}</h2>
      {entries.length === 0 ? <p className="hub-empty">{empty}</p> : <div className="project-list">
        {entries.map(item => <article className={`project-card${item.problem ? ' missing' : ''}`} key={item.path}>
          <button className="project-open" disabled={busy || !!item.problem} onClick={() => void open(() => window.projects.openRecent(item.path))} aria-label={`打开 ${item.name}`}>
            <span className="project-icon"><Folder size={22} /></span>
            <span className="project-detail">
              <strong>{item.name}</strong><span title={item.path}>{item.path}</span>
              {item.problem ? <em><AlertTriangle size={14} />工程不可用 · {item.problem}</em> : <small>上次打开于 {new Date(item.lastOpenedAt).toLocaleString('zh-CN')}</small>}
            </span>
            <span className="mode-badge">Roblox</span>
          </button>
          <button className="project-remove" aria-label={`移出历史 ${item.name}`} title="仅移出历史，不会删除磁盘目录" disabled={busy} onClick={() => void remove(item.path)}><Trash2 size={16} /></button>
        </article>)}
      </div>}
    </section>;
  }

  return <main className="hub" aria-labelledby="hub-title">
    <header className="hub-header">
      <div className="hub-topbar">
        <div className="brand"><img src="./app-icon.svg" width={28} height={28} alt="" /> UI EDITOR</div>
        <button className="secondary" onClick={() => setMcpSettings(true)}><Settings size={18} />设置</button>
      </div>
      <h1 id="hub-title">选择工程</h1>
      <p>创建或打开一个 Roblox 工程，开始你的 UI 设计。</p>
      <div className="hub-actions">
        <button className="primary" disabled={busy} onClick={() => void open(() => window.projects.create())}><FolderPlus size={19} />创建工程</button>
        <button className="secondary" disabled={busy} onClick={() => void open(() => window.projects.open())}><FolderOpen size={19} />打开工程</button>
      </div>
      <p className="creation-hint">选择父文件夹后，将自动创建 UIEditorWorkspace 工程目录。</p>
    </header>
    <div className="hub-content" aria-busy={busy}>
      {error && <div className="error" role="alert"><AlertTriangle size={18} /><span>{error}</span>{recent === null && <button disabled={busy} onClick={() => void load()}>重试</button>}</div>}
      {recent === null && !error && <p className="hub-empty" role="status">正在加载工程历史…</p>}
      {recent && <>
        {section('上次打开', <Clock3 size={18} />, recent.slice(0, 1), '还没有打开过工程，创建你的第一个 Roblox 工程吧。')}
        {section('最近工程', <Folder size={18} />, recent.slice(1), '暂无其他最近工程')}
      </>}
    </div>
    <footer className="hub-footer"><span>UI 编辑器 · 基础版</span><span>本地工程 / Roblox</span></footer>
    {mcpSettings && <McpSettings onClose={() => setMcpSettings(false)} />}
  </main>;
}

function Workspace({ project, onBack }: { project: Project; onBack: () => void }) {
  const editor = useDocumentEditor(project, onBack);
  const history = editor.history;
  const [creatingInterface, setCreatingInterface] = useState(false);
  const [importingRoblox, setImportingRoblox] = useState(false);
  const [uiLibrary, setUiLibrary] = useState('项目UI');
  const [imageLibrary, setImageLibrary] = useState('永久图片');
  const [bottomTab, setBottomTab] = useState<'assets' | 'images' | 'output'>('assets');
  const [selectedAssetId, selectAsset] = useState<string | null>(null);
  const assetLibrary = bottomTab === 'images' ? imageLibrary : uiLibrary;
  const inspectedAsset = editor.imageAssets.find(asset => asset.id === editor.inspectedAssetId);
  function changeBottomTab(tab: typeof bottomTab) { if (tab === bottomTab || editor.clearAssetInspection()) setBottomTab(tab); }
  function changeAssetLibrary(library: string) {
    if (library === assetLibrary || editor.clearAssetInspection()) {
      if (bottomTab === 'images') setImageLibrary(library); else setUiLibrary(library);
    }
  }
  function changeSelectedAsset(id: string) { if (editor.inspectAsset(id)) selectAsset(id); }
  function configureAsset(id: string) {
    const asset = editor.imageAssets.find(a => a.id === id);
    if (asset && editor.inspectAsset(id)) { selectAsset(id); setImageLibrary(asset.library === 'permanent' ? '永久图片' : '项目图片'); setBottomTab('images'); }
  }
  useEffect(() => {
    const listener = (event: Event) => configureAsset((event as CustomEvent<string>).detail);
    window.addEventListener('uie:configure-asset', listener);
    return () => window.removeEventListener('uie:configure-asset', listener);
  });
  const [workspaceTab, setWorkspaceTab] = useState<'design' | 'source' | 'integration'>('design');
  useEffect(() => {
    const show = () => setWorkspaceTab('design'); window.addEventListener('uie:screenshot-start', show);
    return () => window.removeEventListener('uie:screenshot-start', show);
  }, []);
  useEffect(() => { if (editor.runtime.active) setWorkspaceTab('design'); }, [editor.runtime.active]);
  const content = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: window.innerWidth, height: window.innerHeight - 63 });
  const [sizes, setSizes] = useState({ tree: (window.innerWidth <= 1000 ? 180 : 210) / window.innerWidth, properties: (window.innerWidth <= 1000 ? 190 : 230) / window.innerWidth, assets: Math.min(240, Math.max(150, window.innerHeight * .25)) });
  const [dragging, setDragging] = useState<keyof typeof sizes | null>(null);
  const drag = useRef<{ panel: keyof typeof sizes; pointerId: number; start: number; size: number } | null>(null);
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
  const tree = clamp(sizes.tree * bounds.width, 160, bounds.width - 180 - 240 - 12);
  const properties = clamp(sizes.properties * bounds.width, 180, bounds.width - tree - 240 - 12);
  const assets = clamp(sizes.assets, 120, bounds.height - 260 - 6);
  const current = { tree, properties, assets };
  const limits = { tree: [160, bounds.width - properties - 240 - 12], properties: [180, bounds.width - tree - 240 - 12], assets: [120, bounds.height - 260 - 6] };

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setBounds({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(content.current!);
    return () => observer.disconnect();
  }, []);

  function resize(panel: keyof typeof sizes, value: number) {
    const next = { ...current, [panel]: clamp(value, limits[panel][0], limits[panel][1]) };
    setSizes({ tree: next.tree / bounds.width, properties: next.properties / bounds.width, assets: next.assets });
  }

  function separator(panel: keyof typeof sizes, label: string) {
    const horizontal = panel === 'assets';
    return <div className={`workspace-divider${horizontal ? ' horizontal' : ''}`} role="separator" aria-label={label} aria-orientation={horizontal ? 'horizontal' : 'vertical'} aria-valuemin={limits[panel][0]} aria-valuemax={limits[panel][1]} aria-valuenow={Math.round(current[panel])} tabIndex={0}
      onPointerDown={event => {
        if (event.button !== 0 || drag.current) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { panel, pointerId: event.pointerId, start: horizontal ? event.clientY : event.clientX, size: current[panel] };
        setDragging(panel);
      }}
      onPointerMove={event => {
        if (!drag.current || drag.current.pointerId !== event.pointerId) return;
        const delta = (horizontal ? event.clientY : event.clientX) - drag.current.start;
        resize(panel, drag.current.size + (panel === 'tree' ? delta : -delta));
      }}
      onPointerUp={event => {
        if (drag.current?.pointerId !== event.pointerId) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        drag.current = null;
        setDragging(null);
      }}
      onLostPointerCapture={() => { drag.current = null; setDragging(null); }}
      onKeyDown={event => {
        const keys = horizontal ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
        const direction = keys.indexOf(event.key);
        if (direction === -1) return;
        event.preventDefault();
        resize(panel, current[panel] + (direction === 0 ? -10 : 10) * (panel === 'tree' ? 1 : -1));
      }} />;
  }

  return <main className={`workspace${dragging ? ` resizing ${dragging === 'assets' ? 'resizing-horizontal' : 'resizing-vertical'}` : ''}`} style={{ '--tree-width': `${tree}px`, '--properties-width': `${properties}px`, '--assets-height': `${assets}px` } as CSSProperties}>
    <header className="workspace-toolbar">
      <details className="workspace-menu" onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
      }} onKeyDown={event => {
        if (event.key === 'Escape') {
          event.currentTarget.open = false;
          event.currentTarget.querySelector('summary')?.focus();
        }
      }}>
        <summary role="button">文件</summary>
        <div className="workspace-menu-items" onClick={event => event.currentTarget.parentElement?.removeAttribute('open')}>
          <button disabled={editor.busy} onClick={() => setCreatingInterface(true)}>新建界面</button>
          <button disabled={editor.busy} onClick={() => void editor.openDocument()}>打开界面</button>
          <button aria-label="保存" disabled={editor.busy || !editor.hasDocument} onClick={() => void editor.save()}>保存 <span>Ctrl+S</span></button>
          <button aria-label="另存为" disabled={editor.busy || !editor.hasDocument} onClick={() => void editor.save(true)}>另存为 <span>Ctrl+Shift+S</span></button>
          <button disabled={editor.busy || !editor.hasDocument} onClick={() => setImportingRoblox(true)}>导入 Roblox</button>
          <button disabled={editor.busy} onClick={() => void editor.back()}><ArrowLeft size={15} />返回 Hub</button>
        </div>
      </details>
      <details className="workspace-menu" onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
      }} onKeyDown={event => {
        if (event.key === 'Escape') {
          event.currentTarget.open = false;
          event.currentTarget.querySelector('summary')?.focus();
        }
      }}>
        <summary role="button">编辑</summary>
        <div className="workspace-menu-items" onClick={event => event.currentTarget.parentElement?.removeAttribute('open')}>
          <button disabled={editor.busy || !history.canUndo} title={history.undoLabel ?? undefined} onClick={history.undo}>撤销 <span>Ctrl+Z</span></button>
          <button disabled={editor.busy || !history.canRedo} title={history.redoLabel ?? undefined} onClick={history.redo}>重做 <span>Ctrl+Y / Ctrl+Shift+Z</span></button>
        </div>
      </details>
    </header>
    {creatingInterface && <NewInterfaceDialog onCancel={() => setCreatingInterface(false)} onCreate={name => { setCreatingInterface(false); void editor.newDocument(name); }} />}
    {importingRoblox && <RobloxImportDialog document={editor.document} onClose={() => setImportingRoblox(false)} />}
    {editor.error && <div className="editor-error" role="alert">{editor.error}</div>}
    <div className="workspace-content" ref={content}>
    <div className="workspace-body">
      <aside className="panel" aria-label="节点树"><h2><Layers3 size={16} />节点树</h2>{editor.hasDocument && <NodeTree editor={editor} />}</aside>
      {separator('tree', '调整节点树宽度')}
      <section className="workspace-editor" aria-label="界面工作区">
        <div className="runtime-toolbar">
          <button disabled={!editor.hasDocument || (!editor.runtime.active && editor.busy)} onClick={() => {
            if (editor.runtime.active) void editor.runtime.stop();
            else { setWorkspaceTab('design'); void editor.runtime.start(); }
          }}>{editor.runtime.active ? '停止' : '运行'}</button>
          {editor.runtime.active && <>
            <button disabled={!editor.runtime.ready} onClick={() => void editor.runtime.reset()}>重置</button>
            <button disabled={!editor.runtime.ready} onClick={() => void editor.runtime.show()}>打开</button>
            <button disabled={!editor.runtime.ready} onClick={() => void editor.runtime.hide()}>隐藏</button>
          </>}
        </div>
        <nav className="workspace-tabs" aria-label="工作区页签">{(['design', 'source', 'integration'] as const).map((tab, index) => <button key={tab} aria-pressed={workspaceTab === tab} disabled={!editor.hasDocument} onClick={() => setWorkspaceTab(tab)}>{['界面', '交互脚本', '接入脚本'][index]}</button>)}</nav>
        <div className="workspace-editor-content">
          {!editor.hasDocument ? <div className="workspace-empty" role="status">请打开一个工程</div> : <>
          <div hidden={workspaceTab !== 'design'} className="workspace-canvas"><DocumentCanvas editor={editor} visible={workspaceTab === 'design'} /></div>
          {(['source', 'integration'] as const).map(mode => <div key={mode} hidden={workspaceTab !== mode} className="workspace-script"><ScriptPanel editor={editor} mode={mode} /></div>)}
          </>}
        </div>
      </section>
      {separator('properties', '调整属性面板宽度')}
      <aside className="panel properties" aria-label="属性面板"><h2>属性面板</h2>{inspectedAsset ? <ImageAssetProperties key={inspectedAsset.id} editor={editor} asset={inspectedAsset} /> : editor.hasDocument ? <NodeProperties editor={editor} /> : null}</aside>
    </div>
    {separator('assets', '调整资产目录高度')}
    <section className="panel assets" aria-label="底部面板">
      <nav className="bottom-tabs" aria-label="底部页签">
        <button aria-pressed={bottomTab === 'assets'} onClick={() => changeBottomTab('assets')}><FolderOpen size={16} />UI 资产</button>
        <button aria-pressed={bottomTab === 'images'} onClick={() => changeBottomTab('images')}>图片资产</button>
        <button aria-pressed={bottomTab === 'output'} onClick={() => changeBottomTab('output')}>输出</button>
        <span className="assets-location">{bottomTab !== 'output' ? assetLibrary : editor.runtime.active ? '运行中' : '已停止'}</span>
      </nav>
      <div className="assets-body" hidden={bottomTab === 'output'}>
        <nav className="asset-libraries" aria-label="资产库">
          {(bottomTab === 'images' ? ['永久图片', '项目图片'] : ['永久UI', '项目UI']).map(library => <button key={library} className={assetLibrary === library ? 'selected' : ''} aria-pressed={assetLibrary === library} title={library.startsWith('项目') ? project.path : '跨项目复用的资产'} onClick={() => changeAssetLibrary(library)}><Folder size={16} />{library}</button>)}
        </nav>
        {bottomTab === 'images' ? <ImageAssets editor={editor} library={imageLibrary} selectedId={selectedAssetId} select={changeSelectedAsset} /> : <DocumentAssets editor={editor} library={uiLibrary} />}
      </div>
      <div className="bottom-output" hidden={bottomTab !== 'output'}><RuntimeOutput editor={editor} /></div>
    </section>
    </div>
    <footer className="workspace-status"><span><i />{!editor.hasDocument ? '尚未打开界面' : editor.dirty ? '界面有未保存修改' : editor.path ? '界面已保存' : '新界面尚未保存'}</span><span title={editor.path ?? project.path}>Roblox · {editor.path?.split(/[\\/]/).at(-1) ?? (editor.hasDocument ? '1280 × 720' : project.name)}</span></footer>
  </main>;
}
