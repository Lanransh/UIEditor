import { useEffect, useRef, useState } from 'react';
import type { Project } from '../shared/project';
import type { DocumentAPI } from '../shared/documents';
import { findNode, updateNode, type UIDocument, type UINode } from '../shared/uiDocument';
import { useEditorHistory } from '../history/useEditorHistory';
import { useHistoryShortcuts } from '../history/useHistoryShortcuts';
import { projectStrategy } from './roblox';
import { deleteNode, documentCommand, duplicateNode, insertNode, reparentNode, reorderNode } from './commands';

declare global { interface Window { documents: DocumentAPI } }

export function useDocumentEditor(project: Project, onBack: () => void) {
  const strategy = projectStrategy(project.manifest.mode);
  const [initial] = useState(() => strategy.createDocument());
  const history = useEditorHistory(initial);
  const [selectedId, select] = useState(initial.root.id);
  const [path, setPath] = useState<string | null>(null);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const operating = useRef(false);
  useHistoryShortcuts({ ...history, canUndo: !busy && history.canUndo, canRedo: !busy && history.canRedo });
  const document = history.state;
  const dirty = JSON.stringify(document) !== saved;
  const selected = findNode(document.root, selectedId) ?? document.root;
  useEffect(() => { window.documents.setDirty(dirty); }, [dirty]);
  useEffect(() => () => window.documents.setDirty(false), []);

  function execute(label: string, edit: (value: UIDocument) => UIDocument) {
    if (operating.current) return;
    try { history.execute(documentCommand(label, edit, strategy)); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '编辑失败'); }
  }
  function editNode(id: string, edit: (node: UINode) => UINode, label = '修改属性') {
    execute(label, value => ({ ...value, root: updateNode(value.root, id, edit) }));
  }
  async function save(saveAs = false): Promise<boolean> {
    const result = await window.documents.save(document, saveAs);
    if (!result.ok) { setError(result.error); return false; }
    if (!result.value) return false;
    setPath(result.value.path); setSaved(JSON.stringify(result.value.document)); setError('');
    return true;
  }
  async function consent(): Promise<boolean> {
    if (!dirty) return true;
    const answer = await window.documents.confirmChanges();
    if (!answer.ok) { setError(answer.error); return false; }
    return answer.value === 'discard' || (answer.value === 'save' && await save());
  }
  async function run(action: () => Promise<void>) {
    if (operating.current) return;
    operating.current = true; setBusy(true);
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : '文件操作失败'); }
    finally { operating.current = false; setBusy(false); }
  }
  function reset(value: UIDocument, file: string | null) {
    history.reset(value); setSaved(JSON.stringify(value)); setPath(file); select(value.root.id); setError('');
  }
  const newDocument = () => run(async () => {
    if (!await consent()) return;
    const result = await window.documents.newDocument();
    if (!result.ok) { setError(result.error); return; }
    reset(strategy.createDocument(), null);
  });
  const openDocument = (path?: string) => run(async () => {
    if (!await consent()) return;
    const result = await window.documents.open(path);
    if (!result.ok) { setError(result.error); return; }
    if (result.value) reset(strategy.validate(result.value.document), result.value.path);
  });
  const back = () => run(async () => { if (await consent()) onBack(); });
  useEffect(() => window.documents.onCloseRequest(() => { void run(async () => { if (await consent()) window.documents.close(); }); }));
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && !event.repeat) { event.preventDefault(); void run(async () => { await save(event.shiftKey); }); }
    };
    window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener);
  });
  function add(className: string, parentId: string) {
    const node = strategy.createNode(className);
    const parent = findNode(document.root, parentId);
    execute(`新增 ${className}`, value => insertNode(value, parentId, node, strategy));
    // Select only if insertion is valid.
    if (parent && strategy.canParent(parent, node)) select(node.id);
  }
  function remove() { execute('删除节点', value => deleteNode(value, selected.id)); }
  function duplicate() { execute('复制节点', value => duplicateNode(value, selected.id, strategy)); }
  function reparent(parentId: string) { execute('调整父节点', value => reparentNode(value, selected.id, parentId, strategy)); }
  function reorder(direction: -1 | 1) { execute('调整节点顺序', value => reorderNode(value, selected.id, direction)); }
  const pickImage = () => run(async () => {
    const result = await window.documents.pickImage();
    if (!result.ok) { setError(result.error); return; }
    if (result.value) {
      const image = result.value;
      history.execute(documentCommand('设置预览图片', value => ({ ...value, root: updateNode(value.root, selected.id, node => ({ ...node, previewImage: image })) }), strategy));
    }
  });
  return { strategy, document, history, selected, select, editNode, execute, add, remove, duplicate, reparent, reorder, pickImage,
    newDocument, openDocument, save: (saveAs = false) => run(async () => { await save(saveAs); }), back, dirty, path, error, busy };
}
export type DocumentEditor = ReturnType<typeof useDocumentEditor>;
