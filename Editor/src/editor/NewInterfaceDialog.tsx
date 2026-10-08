import { useEffect, useRef, useState } from 'react';
import { interfaceNameError, scriptClassNames } from '../shared/uiDocument';

export function NewInterfaceDialog({ onCreate, onCancel }: { onCreate: (name: string) => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const error = interfaceNameError(name);
  const classes = error ? null : scriptClassNames(name);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="new-interface-dialog" onCancel={onCancel} aria-labelledby="new-interface-title">
    <form onSubmit={event => { event.preventDefault(); if (!error) onCreate(name.trim()); }}>
      <h2 id="new-interface-title">新建界面</h2>
      <label>界面名称<input autoFocus aria-label="新界面名称" value={name} placeholder="例如 OnlineReward" aria-invalid={!!name && !!error} aria-describedby="interface-name-help" onChange={event => setName(event.target.value)} /></label>
      <p id="interface-name-help">{name && error ? error : '使用英文字母、数字和下划线，不能以数字开头或使用关键字。'}</p>
      {classes && <div className="new-interface-classes"><span>展示类：{classes.source}</span><span>模拟类：{classes.integration}</span></div>}
      <div className="new-interface-actions"><button type="button" onClick={onCancel}>取消</button><button type="submit" disabled={!!error}>创建</button></div>
    </form>
  </dialog>;
}
