import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Circle, Download, LoaderCircle, RefreshCw, X } from 'lucide-react';
import type { DocumentAsset } from '../shared/documents';
import { documentLocation } from '../shared/documents';
import { findUnconfiguredRobloxImages } from '../shared/robloxImport';
import type { BatchExportItem, BatchExportStatus } from './batchExport';
import { createBatchExportSnapshot, runSequentialExport } from './batchExport';
import type { DocumentEditor } from './useDocumentEditor';

const statusText: Record<BatchExportStatus, string> = {
  queued: '等待导出', loading: '读取界面', submitting: '提交中', waiting: '等待 Studio', succeeded: '已完成', failed: '失败',
  stopped: '已暂停', uncertain: '结果未知', skipped: '未导出',
};

function StatusIcon({ status }: { status: BatchExportStatus }) {
  if (status === 'succeeded') return <Check size={13} aria-hidden="true" />;
  if (status === 'failed') return <X size={13} aria-hidden="true" />;
  if (['queued', 'stopped', 'uncertain', 'skipped'].includes(status)) return <Circle size={10} aria-hidden="true" />;
  return <LoaderCircle className="batch-export-spinner" size={13} aria-hidden="true" />;
}

export function BatchExportMenu({ editor }: { editor: DocumentEditor }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const running = useRef(false);
  const mounted = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const initialized = useRef(false);
  const [assets, setAssets] = useState<DocumentAsset[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [queue, setQueue] = useState<BatchExportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [controlling, setControlling] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void window.documents.listAssets('project').then(result => {
      if (cancelled) return;
      if (!result.ok) { setError(result.error); return; }
      const paths = new Set(result.value.map(asset => asset.path));
      const initialPath = initialized.current ? null : editor.path;
      setAssets(result.value);
      setSelected(current => {
        const next = new Set([...current].filter(path => paths.has(path)));
        if (initialPath && paths.has(initialPath)) next.add(initialPath);
        return next;
      });
      initialized.current = true;
      setError('');
    }).catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : '无法读取项目UI。');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [editor.path, editor.documentAssetRevision, revision]);

  const chosen = assets.filter(asset => selected.has(asset.path));
  const completed = queue.filter(item => item.status === 'succeeded' || item.status === 'failed').length;
  const succeeded = queue.filter(item => item.status === 'succeeded').length;
  const failed = queue.filter(item => item.status === 'failed').length;
  const allSelected = assets.length > 0 && chosen.length === assets.length;
  const busy = active || controlling || editor.busy;
  const pending = queue.find(item => item.status === 'stopped' || item.status === 'uncertain');

  function toggle(path: string) {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(assets.map(asset => asset.path)));
  }

  function updateItem(updated: BatchExportItem) {
    if (mounted.current) setQueue(current => current.map(item => item.path === updated.path ? updated : item));
  }

  async function start(resume = false) {
    const batch: BatchExportItem[] = resume
      ? queue.filter(item => ['stopped', 'uncertain', 'skipped'].includes(item.status))
      : chosen.map(asset => ({ ...asset, status: 'queued', message: '等待导出…' }));
    if (running.current || editor.busy || !batch.length || (!resume && pending)) return;
    menu.current?.querySelector('summary')?.focus();
    const operation = new AbortController();
    controller.current = operation;
    running.current = true;
    setActive(true);
    setError('');
    if (!resume) setQueue(batch);
    try {
      const discovered = await window.toolkit.discover();
      if (operation.signal.aborted) throw new Error('队列已停止。');
      if (!discovered.ok) throw new Error(discovered.error);
      if (!discovered.value.length) throw new Error('请在 Toolkit 打开目标游戏工程，并在项目设置填写 PlaceId。');
      if (resume && !discovered.value.some(target => target.id === targetId)) throw new Error('原目标工程连接已失效，请重新连接原工程后继续。');
      if (!resume && discovered.value.length !== 1) throw new Error('Toolkit 连接了多个游戏工程，请在 Toolkit 仅保留本次导出的工程连接。');
      const target = resume ? targetId : discovered.value[0].id;
      setTargetId(target);
      await runSequentialExport(batch, {
        signal: operation.signal,
        load: async path => {
          const result = await window.documents.previewAsset(path, 'project');
          if (!result.ok) throw new Error(result.error);
          return createBatchExportSnapshot(result.value.document, editor.inspectImages());
        },
        validationError: document => {
          const missing = findUnconfiguredRobloxImages(document, editor.inspectImages());
          return missing.length ? `有 ${missing.length} 张图片未配置 Roblox ID，请先用单界面导出处理。` : '';
        },
        submit: async document => {
          const result = await window.toolkit.submit(target, document);
          if (!result.ok) throw new Error(result.error);
          return result.value;
        },
        status: async task => {
          const result = await window.toolkit.task(target, task.id, 'status');
          if (!result.ok) throw new Error(result.error);
          return result.value;
        },
        onUpdate: updateItem,
      });
    } catch (cause) {
      if (!mounted.current) return;
      const message = cause instanceof Error ? cause.message : String(cause);
      if (!operation.signal.aborted) setError(message);
      setQueue(current => current.map(item => item.status === 'queued' || item.status === 'loading' || item.status === 'submitting'
        ? { ...item, status: operation.signal.aborted ? 'skipped' : 'failed', message } : item));
    } finally {
      running.current = false;
      if (mounted.current) { setActive(false); setStopping(false); }
    }
  }

  function stop() {
    menu.current?.querySelector('summary')?.focus();
    setStopping(true);
    controller.current?.abort();
  }

  async function cancelTask() {
    if (running.current || !pending?.task) return;
    menu.current?.querySelector('summary')?.focus();
    running.current = true; setControlling(true); setError('');
    try {
      const result = await window.toolkit.task(targetId, pending.task.id, 'cancel');
      if (!mounted.current) return;
      if (!result.ok) throw new Error(result.error);
      const task = result.value;
      updateItem({ ...pending, task, status: task.status === 'succeeded' ? 'succeeded'
        : task.status === 'failed' || task.status === 'cancelled' ? 'failed' : 'stopped',
        message: task.status === 'cancelled' ? '导出已取消' : task.message || '当前任务仍未结束，请继续查询。' });
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      running.current = false;
      if (mounted.current) setControlling(false);
    }
  }

  return <details ref={menu} className="workspace-menu batch-export-menu" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
  }} onKeyDown={event => {
    if (event.key === 'Escape') {
      event.currentTarget.open = false;
      event.currentTarget.querySelector('summary')?.focus();
    }
  }}>
    <summary role="button" aria-label="批量导出">
      <Download size={14} aria-hidden="true" />
      批量导出
      {active ? <span className="batch-export-pill">{completed}/{queue.length}</span>
        : selected.size > 0 ? <span className="batch-export-pill">{selected.size}</span> : null}
      <ChevronDown className="batch-export-chevron" size={13} aria-hidden="true" />
    </summary>
    <section className="batch-export-panel" role="region" aria-label="多选导出项目UI">
      <header className="batch-export-header">
        <div>
          <strong>多选导出</strong>
          <span>按顺序导出项目UI的已保存版本</span>
        </div>
        <button type="button" className="batch-export-refresh" title="刷新项目UI列表" aria-label="刷新项目UI列表"
          disabled={active || loading} onClick={() => { menu.current?.querySelector('summary')?.focus(); setRevision(value => value + 1); }}>
          <RefreshCw size={14} aria-hidden="true" />
        </button>
      </header>
      <div className="batch-export-selection">
        <span>{loading ? '正在读取项目UI…' : `${assets.length} 个项目UI`}</span>
        <button type="button" disabled={active || loading || assets.length === 0} onClick={toggleAll}>{allSelected ? '清空' : '全选'}</button>
      </div>
      <div className="batch-export-list" role="list" aria-label="项目UI列表">
        {assets.map(asset => {
          const item = queue.find(entry => entry.path === asset.path);
          const location = documentLocation(editor.projectPath, asset.path);
          const checked = active ? queue.some(entry => entry.path === asset.path) : selected.has(asset.path);
          return <label key={asset.path} className={`batch-export-item${checked ? ' selected' : ''}${item ? ` ${item.status}` : ''}`}>
            <input type="checkbox" checked={checked} disabled={busy} onChange={() => toggle(asset.path)} />
            <span className="batch-export-check"><Check size={12} aria-hidden="true" /></span>
            <span className="batch-export-copy">
              <strong>{asset.name}</strong>
              <small title={asset.path}>{location?.relativePath ?? asset.name}</small>
            </span>
            {item ? <span className={`batch-export-status ${item.status}`} title={item.message}>
              <StatusIcon status={item.status} />
              {statusText[item.status]}
            </span> : <span className={`batch-export-status ${checked ? 'queued' : 'muted'}`}><Circle size={10} aria-hidden="true" />{checked ? '已选择' : '未选择'}</span>}
          </label>;
        })}
        {!loading && assets.length === 0 && <p className="batch-export-empty">还没有项目UI。先保存当前界面，或在“文件”菜单中选择“保存为项目UI”。</p>}
      </div>
      {error && <div className="batch-export-error" role="alert">{error}</div>}
      {!active && pending && <div className="batch-export-recovery" role="status">
        <span>{pending.message}</span>
        {pending.task ? <small>目标：{targetId} · 任务：{pending.task.id}</small>
          : <small>重试当前项会使用原快照恢复任务；确认当前项结束后才会继续。</small>}
      </div>}
      {queue.length > 0 && <div className="batch-export-progress">
        <div><span>{active ? `正在导出 ${Math.min(completed + 1, queue.length)} / ${queue.length}` : `${pending ? '队列已暂停' : queue.some(item => item.status === 'skipped') ? '队列已停止' : '本轮完成'} · ${succeeded} 成功${failed ? ` · ${failed} 失败` : ''}`}</span>
          <strong>{queue.find(item => ['loading', 'submitting', 'waiting'].includes(item.status))?.message ?? (active ? '准备下一项…' : '')}</strong></div>
        <span className="batch-export-bar" role="progressbar" aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={completed}>
          <i style={{ width: `${queue.length ? completed / queue.length * 100 : 0}%` }} />
        </span>
      </div>}
      <footer className="batch-export-footer">
        <span>已选 {chosen.length} 个</span>
        <div className="batch-export-actions">
          {active ? <button type="button" disabled={stopping} onClick={stop}>{stopping ? '正在停止…' : '停止队列'}</button>
            : pending ? <>
              {pending.task && <button type="button" disabled={busy} onClick={() => void cancelTask()}>取消当前任务</button>}
              <button type="button" className="batch-export-start" disabled={busy} onClick={() => void start(true)}>{pending.task ? '继续队列' : '重试当前项'}</button>
            </> : <button type="button" className="batch-export-start" disabled={busy || loading || chosen.length === 0} onClick={() => void start()}>
              {`开始导出${chosen.length ? `（${chosen.length}）` : ''}`}
            </button>}
        </div>
      </footer>
    </section>
  </details>;
}
