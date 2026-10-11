import { useEffect, useRef, useState } from 'react';

export function ImageFolderDialog({ mode, folders, current, onSubmit, onClose }: {
  mode: 'create' | 'move'; folders: string[]; current: string;
  onSubmit(value: string): Promise<void>; onClose(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(mode === 'create' ? '新建文件夹' : current);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const title = mode === 'create' ? '新建图片文件夹' : '移动图片';
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="new-interface-dialog" aria-label={title} onCancel={event => { if (busy) event.preventDefault(); else onClose(); }}>
    <form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError('');
      try { await onSubmit(value); onClose(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
      finally { setBusy(false); }
    }}>
      <h2>{title}</h2>
      {mode === 'create' ? <label>文件夹名称<input autoFocus aria-label="文件夹名称" required maxLength={100} value={value} disabled={busy} onChange={event => setValue(event.target.value)} /></label>
        : <label>目标文件夹<select autoFocus aria-label="目标文件夹" value={value} disabled={busy} onChange={event => setValue(event.target.value)}>
          <option value="">项目图片根目录</option>{folders.map(folder => <option key={folder} value={folder}>{folder}</option>)}
        </select></label>}
      {error && <p role="alert">{error}</p>}
      <div className="new-interface-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button><button type="submit" disabled={busy || (mode === 'create' && !value.trim())}>{mode === 'create' ? '创建' : '移动'}</button></div>
    </form>
  </dialog>;
}
