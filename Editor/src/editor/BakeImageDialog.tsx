import { useEffect, useRef, useState } from 'react';
import type { UINode } from '../shared/uiDocument';
import type { DocumentEditor } from './useDocumentEditor';
import { bakeSize, type BakedNodeClass } from './imageBake';

export function BakeImageDialog({ editor, node, onClose }: { editor: DocumentEditor; node: UINode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [size] = useState(() => bakeSize(editor.document, node.id, editor.strategy));
  const [name, setName] = useState(node.name);
  const [width, setWidth] = useState(String(size.width));
  const [height, setHeight] = useState(String(size.height));
  const [className, setClassName] = useState<BakedNodeClass>(['TextButton', 'ImageButton'].includes(node.className) ? 'ImageButton' : 'ImageLabel');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="new-interface-dialog" aria-label="烘焙为图片" onCancel={event => { if (working) event.preventDefault(); else onClose(); }}>
    <form onSubmit={async event => {
      event.preventDefault();
      if (working) return;
      setWorking(true); setError('');
      try { await editor.bakeImage(node.id, name, Number(width), Number(height), className); onClose(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : '烘焙失败'); }
      finally { setWorking(false); }
    }}>
      <h2>烘焙为图片</h2>
      <label>图片名称<input autoFocus aria-label="图片名称" required maxLength={100} value={name} disabled={working} onChange={event => setName(event.target.value)} /></label>
      <label>宽度（像素）<input aria-label="图片宽度" type="number" min={1} max={4096} step={1} required value={width} disabled={working} onChange={event => setWidth(event.target.value)} /></label>
      <label>高度（像素）<input aria-label="图片高度" type="number" min={1} max={4096} step={1} required value={height} disabled={working} onChange={event => setHeight(event.target.value)} /></label>
      <label>转换为<select aria-label="转换为" value={className} disabled={working} onChange={event => setClassName(event.target.value as BakedNodeClass)}>
        <option value="ImageButton">图片按钮（ImageButton）</option><option value="ImageLabel">图片节点（ImageLabel）</option>
      </select></label>
      <p>保存到项目图片资产。将“{node.name}”本身的外观与全部子节点合成为一张图片，转换可撤销。引用子节点的脚本需相应调整。</p>
      {error && <p role="alert">{error}</p>}
      <div className="new-interface-actions"><button type="button" disabled={working} onClick={onClose}>取消</button><button type="submit" disabled={working || editor.busy || !name.trim()}>{working ? '正在烘焙…' : '烘焙并转换'}</button></div>
    </form>
  </dialog>;
}
