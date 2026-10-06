import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Clock3, Folder, FolderOpen, FolderPlus, Layers3, Trash2 } from 'lucide-react';
import type { Project, ProjectAPI, RecentProjectView, Result } from './shared/project';
import { useDocumentEditor } from './editor/useDocumentEditor';
import { NodeTree, NodeProperties } from './editor/NodePanels';
import { DocumentCanvas } from './editor/Canvas';
import { DocumentAssets } from './editor/DocumentAssets';
import { ScriptPanel, RuntimeOutput } from './editor/ScriptPanel';

declare global { interface Window { projects: ProjectAPI } }

export function App() {
  const [project, setProject] = useState<Project | null>(null);
  useEffect(() => { document.title = project ? `${project.name} · Roblox — UI 编辑器` : 'UI 编辑器'; }, [project]);
  return project ? <Workspace key={project.path} project={project} onBack={() => setProject(null)} /> : <ProjectHub onOpen={setProject} />;
}

function ProjectHub({ onOpen }: { onOpen: (project: Project) => void }) {
  const [recent, setRecent] = useState<RecentProjectView[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);

  async function load() {
    setBusy(true);
    setError('');
    try {
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
      <div className="brand"><img src="./app-icon.svg" width={28} height={28} alt="" /> UI EDITOR</div>
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
  </main>;
}

function Workspace({ project, onBack }: { project: Project; onBack: () => void }) {
  const editor = useDocumentEditor(project, onBack);
  const history = editor.history;
  const [assetLibrary, setAssetLibrary] = useState('项目资产');
  const [bottomTab, setBottomTab] = useState<'assets' | 'output'>('assets');
  const [workspaceTab, setWorkspaceTab] = useState<'design' | 'source' | 'integration'>('design');
  const content = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: window.innerWidth, height: window.innerHeight - 63 });
  const [sizes, setSizes] = useState({ tree: window.innerWidth <= 1000 ? 180 : 210, properties: window.innerWidth <= 1000 ? 190 : 230, assets: Math.min(240, Math.max(150, window.innerHeight * .25)) });
  const [dragging, setDragging] = useState<keyof typeof sizes | null>(null);
  const drag = useRef<{ panel: keyof typeof sizes; pointerId: number; start: number; size: number } | null>(null);
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
  const tree = clamp(sizes.tree, 160, bounds.width - 180 - 240 - 12);
  const properties = clamp(sizes.properties, 180, bounds.width - tree - 240 - 12);
  const assets = clamp(sizes.assets, 120, bounds.height - 260 - 6);
  const current = { tree, properties, assets };
  const limits = { tree: [160, bounds.width - properties - 240 - 12], properties: [180, bounds.width - tree - 240 - 12], assets: [120, bounds.height - 260 - 6] };

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setBounds({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(content.current!);
    return () => observer.disconnect();
  }, []);

  function resize(panel: keyof typeof sizes, value: number) {
    setSizes({ ...current, [panel]: clamp(value, limits[panel][0], limits[panel][1]) });
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
          <button disabled={editor.busy} onClick={() => void editor.newDocument()}>新建界面</button>
          <button disabled={editor.busy} onClick={() => void editor.openDocument()}>打开界面</button>
          <button aria-label="保存" disabled={editor.busy} onClick={() => void editor.save()}>保存 <span>Ctrl+S</span></button>
          <button aria-label="另存为" disabled={editor.busy} onClick={() => void editor.save(true)}>另存为 <span>Ctrl+Shift+S</span></button>
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
      <div className="runtime-toolbar">
        <button disabled={editor.busy} onClick={() => { setWorkspaceTab('design'); void editor.runtime.start(); }}>运行</button>
        <button disabled={!editor.runtime.active} onClick={() => void editor.runtime.stop()}>停止</button>
        <button disabled={!editor.runtime.ready} onClick={() => void editor.runtime.reset()}>重置</button>
      </div>
    </header>
    {editor.error && <div className="editor-error" role="alert">{editor.error}</div>}
    <div className="workspace-content" ref={content}>
    <div className="workspace-body">
      <aside className="panel" aria-label="节点树"><h2><Layers3 size={16} />节点树</h2><NodeTree editor={editor} /></aside>
      {separator('tree', '调整节点树宽度')}
      <section className="workspace-editor" aria-label="界面工作区">
        <nav className="workspace-tabs" aria-label="工作区页签">{(['design', 'source', 'integration'] as const).map((tab, index) => <button key={tab} aria-pressed={workspaceTab === tab} onClick={() => setWorkspaceTab(tab)}>{['编辑界面', '界面脚本', '模拟接入脚本'][index]}</button>)}</nav>
        <div className="workspace-editor-content">
          <div hidden={workspaceTab !== 'design'} className="workspace-canvas"><DocumentCanvas editor={editor} visible={workspaceTab === 'design'} /></div>
          {(['source', 'integration'] as const).map(mode => <div key={mode} hidden={workspaceTab !== mode} className="workspace-script"><ScriptPanel editor={editor} mode={mode} /></div>)}
        </div>
      </section>
      {separator('properties', '调整属性面板宽度')}
      <aside className="panel properties" aria-label="属性面板"><h2>属性面板</h2><NodeProperties editor={editor} /></aside>
    </div>
    {separator('assets', '调整资产目录高度')}
    <section className="panel assets" aria-label="底部面板">
      <nav className="bottom-tabs" aria-label="底部页签">
        <button aria-pressed={bottomTab === 'assets'} onClick={() => setBottomTab('assets')}><FolderOpen size={16} />资产目录</button>
        <button aria-pressed={bottomTab === 'output'} onClick={() => setBottomTab('output')}>输出</button>
        <span className="assets-location">{bottomTab === 'assets' ? assetLibrary : editor.runtime.active ? '运行中' : '已停止'}</span>
      </nav>
      <div className="assets-body" hidden={bottomTab !== 'assets'}>
        <nav className="asset-libraries" aria-label="资产库">
          {['永久资产', '项目资产'].map(library => <button key={library} className={assetLibrary === library ? 'selected' : ''} aria-pressed={assetLibrary === library} title={library === '项目资产' ? project.path : '跨项目复用的资产'} onClick={() => setAssetLibrary(library)}><Folder size={16} />{library}</button>)}
        </nav>
        <DocumentAssets editor={editor} library={assetLibrary} />
      </div>
      <div className="bottom-output" hidden={bottomTab !== 'output'}><RuntimeOutput editor={editor} /></div>
    </section>
    </div>
    <footer className="workspace-status"><span><i />{editor.dirty ? '界面有未保存修改' : editor.path ? '界面已保存' : '新界面尚未保存'}</span><span title={editor.path ?? project.path}>Roblox · {editor.path?.split(/[\\/]/).at(-1) ?? '1280 × 720'}</span></footer>
  </main>;
}
