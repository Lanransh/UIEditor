import { useEffect, useRef, useState } from 'react';
import type { DocumentEditor } from './useDocumentEditor';

export function SaveDocumentDialog({ editor, onClose }: { editor: DocumentEditor; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState('project');
  const [folders, setFolders] = useState<string[]>([]);
  const [folder, setFolder] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    let cancelled = false;
    void window.documents.listTemplateFolders().then(result => {
      if (cancelled) return;
      if (result.ok) setFolders(result.value); else setError(result.error);
    }).catch(cause => { if (!cancelled) setError(String(cause)); });
    return () => { cancelled = true; };
  }, []);
  return <dialog ref={dialog} className="new-interface-dialog" aria-label="保存UI" onCancel={onClose}>
    <form onSubmit={event => {
      event.preventDefault();
      onClose();
      if (target === 'project') void editor.saveProjectUI();
      else void editor.saveTemplate(folder);
    }}>
      <h2>保存UI</h2>
      <label>保存到<select autoFocus aria-label="保存到" value={target} onChange={event => setTarget(event.target.value)}>
        <option value="project">项目UI</option><option value="templates">模板参考</option>
      </select></label>
      {target === 'templates' && <label>模板文件夹<select aria-label="模板文件夹" value={folder} onChange={event => setFolder(event.target.value)}>
        <option value="">模板参考根目录</option>{folders.map(name => <option key={name} value={name}>{name}</option>)}
      </select></label>}
      {error && <p role="alert">{error}</p>}
      <div className="new-interface-actions"><button type="button" onClick={onClose}>取消</button><button type="submit" disabled={editor.busy || (target === 'templates' && !!error)}>保存</button></div>
    </form>
  </dialog>;
}
