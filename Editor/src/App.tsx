import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Clock3, Folder, FolderOpen, FolderPlus, Layers3, MousePointer2, PanelTop, Trash2 } from 'lucide-react';
import type { Project, ProjectAPI, RecentProjectView, Result } from './shared/project';

declare global { interface Window { projects: ProjectAPI } }

export function App() {
  const [project, setProject] = useState<Project | null>(null);
  useEffect(() => { document.title = project ? `${project.name} · Roblox — UI 编辑器` : 'UI 编辑器'; }, [project]);
  return project ? <Workspace project={project} onBack={() => setProject(null)} /> : <ProjectHub onOpen={setProject} />;
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
      <div className="brand"><PanelTop size={19} /> UI EDITOR</div>
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
  return <main className="workspace">
    <header className="workspace-toolbar">
      <button className="back" onClick={onBack}><ArrowLeft size={17} />返回 Hub</button>
      <div className="workspace-name"><strong>{project.name}</strong><span title={project.path}>{project.path}</span></div>
      <span className="mode-badge">Roblox</span>
    </header>
    <div className="workspace-body">
      <aside className="panel" aria-label="节点树"><h2><Layers3 size={16} />节点树</h2><div className="panel-empty"><Layers3 size={28} /><p>暂无节点</p><span>当前工程尚未创建界面</span></div></aside>
      <section className="canvas" aria-label="空画布"><div className="canvas-heading">画布<span>空工作台</span></div><div className="canvas-surface"><div className="canvas-empty"><PanelTop size={38} strokeWidth={1.3} /><h1>从这里开始设计</h1><p>工程已就绪</p><span>基础版提供工程管理，界面编辑能力将在后续加入。</span></div></div></section>
      <aside className="panel properties" aria-label="属性"><h2>属性</h2><div className="panel-empty"><MousePointer2 size={28} /><p>未选择节点</p><span>节点属性将显示在这里</span></div></aside>
    </div>
    <footer className="workspace-status"><span><i />工程已保存</span><span>Roblox · 本地工程</span></footer>
  </main>;
}
