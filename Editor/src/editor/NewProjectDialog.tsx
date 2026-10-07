import { useEffect, useRef, useState } from 'react';
import type { RecentProjectView } from '../shared/project';

export function NewProjectDialog({ recent, onCreate, onCancel }: { recent: RecentProjectView[]; onCreate: (templateSource?: string) => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [source, setSource] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="new-interface-dialog new-project-dialog" onCancel={onCancel} aria-labelledby="new-project-title">
    <form onSubmit={event => { event.preventDefault(); onCreate(source || undefined); }}>
      <h2 id="new-project-title">创建工程</h2>
      <fieldset className="template-source-options" aria-describedby="template-clone-help">
        <legend>克隆模板参考（可选）</legend>
        <div className="template-source-list">
          <label className={source === '' ? 'selected' : ''}><input autoFocus type="radio" name="template-source" checked={source === ''} onChange={() => setSource('')} /><span>不克隆模板参考</span></label>
          {recent.map(item => <label key={item.path} className={`${source === item.path ? 'selected' : ''}${item.problem ? ' unavailable' : ''}`}>
            <input type="radio" name="template-source" checked={source === item.path} disabled={!!item.problem} onChange={() => setSource(item.path)} />
            <span>{item.name}{item.problem && <small>工程不可用</small>}</span>
          </label>)}
        </div>
      </fieldset>
      <p id="template-clone-help">仅复制来源工程的全部模板参考及其子文件夹，不复制项目UI或项目图片，不修改来源工程。下一步选择新工程的父文件夹。</p>
      <div className="new-interface-actions"><button type="button" onClick={onCancel}>取消</button><button type="submit">下一步</button></div>
    </form>
  </dialog>;
}
