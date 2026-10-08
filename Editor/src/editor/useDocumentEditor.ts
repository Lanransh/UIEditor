import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '../shared/project';
import type { DocumentAPI, DocumentLibrary } from '../shared/documents';
import { findNode, updateNode, type PropertyValue, type UIDocument, type UINode } from '../shared/uiDocument';
import { useEditorHistory } from '../history/useEditorHistory';
import { useHistoryShortcuts } from '../history/useHistoryShortcuts';
import { projectStrategy } from './roblox';
import { deleteNode, documentCommand, duplicateNode, insertNode, pasteNode, reparentNode } from './commands';
import { useRuntime } from './useRuntime';
import { useAutomation } from './useAutomation';
import { applyImageAsset, resolveImageAssets, type ImageAsset, type ImageAssetUpdate, type ImageLibrary } from '../shared/imageAssets';

declare global { interface Window { documents: DocumentAPI } }

export function useDocumentEditor(project: Project, onBack: () => void) {
  const strategy = projectStrategy(project.manifest.mode);
  const [initial] = useState(() => strategy.createDocument());
  const history = useEditorHistory(initial);
  const [hasDocument, setHasDocument] = useState(false);
  const [selectedId, setSelectedId] = useState(initial.root.id);
  const [inspectedAssetId, setInspectedAssetId] = useState<string | null>(null);
  const [assetConfigurationDirty, setAssetConfigurationDirty] = useState(false);
  function clearAssetInspection() {
    if (assetConfigurationDirty && !window.confirm('图片资产属性尚未保存，是否放弃这些修改？')) return false;
    setAssetConfigurationDirty(false); setInspectedAssetId(null); return true;
  }
  function select(id: string) { if (!clearAssetInspection()) return false; setSelectedId(id); return true; }
  function inspectAsset(id: string) { if (id !== inspectedAssetId && !clearAssetInspection()) return false; setInspectedAssetId(id); return true; }
  const [path, setPath] = useState<string | null>(null);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const fileState = useRef({ path: null as string | null, saved: JSON.stringify(initial) });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const operating = useRef(false);
  const clipboard = useRef<UINode | null>(null);
  const [imageAssets, setImageAssets] = useState<ImageAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const document = useMemo(() => resolveImageAssets(history.state, imageAssets), [history.state, imageAssets]);
  useEffect(() => {
    let cancelled = false;
    void window.imageAssets.list().then(result => {
      if (cancelled) return;
      if (result.ok) setImageAssets(result.value); else setError(result.error);
    }).catch(cause => { if (!cancelled) setError(String(cause)); }).finally(() => { if (!cancelled) setAssetsLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const runtime = useRuntime(document);
  useHistoryShortcuts({ ...history, canUndo: !busy && !runtime.active && history.canUndo, canRedo: !busy && !runtime.active && history.canRedo });
  const dirty = hasDocument && JSON.stringify(document) !== saved;
  const inspectionDocument = runtime.frame?.document ?? document;
  const selected = findNode(inspectionDocument.root, selectedId) ?? inspectionDocument.root;
  useEffect(() => { window.documents.setDirty(dirty || assetConfigurationDirty); }, [dirty, assetConfigurationDirty]);
  useEffect(() => () => window.documents.setDirty(false), []);

  function execute(label: string, edit: (value: UIDocument) => UIDocument) {
    if (!hasDocument || operating.current || runtime.active) return;
    try { history.execute(documentCommand(label, value => edit(resolveImageAssets(value, imageAssets)), strategy)); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '编辑失败'); }
  }
  function editNode(id: string, edit: (node: UINode) => UINode, label = '修改属性') {
    execute(label, value => ({ ...value, root: updateNode(value.root, id, edit) }));
  }
  function editProperty(id: string, property: string, value: PropertyValue) {
    if (runtime.active) {
      if (!runtime.ready || operating.current) return;
      try {
        strategy.validate({ ...inspectionDocument, root: updateNode(inspectionDocument.root, id, node => property === 'Name'
          ? { ...node, name: value as string }
          : { ...node, properties: { ...node.properties, [property]: value } }) });
        setError('');
        void runtime.setProperty(id, property, value);
      } catch (cause) { setError(cause instanceof Error ? cause.message : '编辑失败'); }
    } else editNode(id, node => property === 'Name' ? { ...node, name: value as string } : { ...node, properties: { ...node.properties, [property]: value } }, property === 'Name' ? '节点改名' : '修改属性');
  }
  async function save(saveAs = false, projectUI = false): Promise<boolean> {
    if (!hasDocument) return false;
    const result = await window.documents.save(document, saveAs, projectUI);
    if (!result.ok) { setError(result.error); return false; }
    if (!result.value) return false;
    fileState.current = { path: result.value.path, saved: JSON.stringify(result.value.document) };
    setPath(result.value.path); setSaved(JSON.stringify(result.value.document)); setError('');
    return true;
  }
  async function consent(): Promise<boolean> {
    if (!clearAssetInspection()) return false;
    if (!dirty) return true;
    const answer = await window.documents.confirmChanges();
    if (!answer.ok) { setError(answer.error); return false; }
    return answer.value === 'discard' || (answer.value === 'save' && await save());
  }
  async function run(action: () => Promise<void>) {
    if (operating.current) return;
    operating.current = true; setBusy(true);
    try { await runtime.stop(); await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : '文件操作失败'); }
    finally { operating.current = false; setBusy(false); }
  }
  function reset(value: UIDocument, file: string | null) {
    fileState.current = { path: file, saved: JSON.stringify(resolveImageAssets(value, imageAssets)) };
    setHasDocument(true);
    history.reset(value); setSaved(JSON.stringify(resolveImageAssets(value, imageAssets))); setPath(file); setInspectedAssetId(null); setAssetConfigurationDirty(false); setSelectedId(value.root.id); setError('');
  }
  const newDocument = (name: string) => run(async () => {
    const value = strategy.createDocument(name);
    if (!await consent()) return;
    const result = await window.documents.newDocument();
    if (!result.ok) { setError(result.error); return; }
    reset(value, null);
  });
  const openDocument = (path?: string) => run(async () => {
    if (!await consent()) return;
    const result = await window.documents.open(path);
    if (!result.ok) { setError(result.error); return; }
    if (result.value) reset(strategy.validate(result.value.document), result.value.path);
  });
  const openTemplate = (path: string, library: 'templates' | 'permanent' = 'templates') => run(async () => {
    if (!await consent()) return;
    const result = await window.documents.openTemplate(path, library);
    if (!result.ok) { setError(result.error); return; }
    reset(strategy.validate(result.value.document), null);
  });
  const saveTemplate = (folder?: string) => run(async () => {
    if (!hasDocument) return;
    const result = await window.documents.saveTemplate(document, folder);
    if (!result.ok) { setError(result.error); return; }
    if (result.value) setError('');
  });
  const moveAsset = (assetPath: string, source: DocumentLibrary, target: DocumentLibrary) => run(async () => {
    const result = await window.documents.moveAsset(assetPath, source, target);
    if (!result.ok) { setError(result.error); return; }
    if (fileState.current.path === assetPath) {
      fileState.current = { ...fileState.current, path: result.value.path };
      setPath(result.value.path);
    }
    setError('');
  });
  const back = () => run(async () => { if (await consent()) onBack(); });
  useEffect(() => window.documents.onCloseRequest(() => { void run(async () => { if (await consent()) window.documents.close(); }); }));
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && !event.repeat) { event.preventDefault(); void run(async () => { await save(event.shiftKey); }); }
    };
    window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener);
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (!hasDocument || operating.current || event.defaultPrevented || event.isComposing || event.repeat || event.altKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.closest('input, textarea, select') || target.isContentEditable)) return;
      if (event.key === 'Delete' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault(); remove(); return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (!['c', 'v', 'd'].includes(key)) return;
      event.preventDefault();
      if (key === 'c') {
        if (selected.id !== document.root.id) clipboard.current = structuredClone(selected);
      } else if (key === 'v') {
        const node = clipboard.current;
        if (node) execute('粘贴节点', value => pasteNode(value, selected.id, node, strategy));
      } else duplicate();
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
  const pickImage = () => run(async () => {
    const result = await window.documents.pickImage();
    if (!result.ok) { setError(result.error); return; }
    if (result.value) {
      const image = result.value;
      history.execute(documentCommand('设置预览图片', value => ({ ...value, root: updateNode(value.root, selected.id, node => { const { imageAssetId: _, ...rest } = node; return { ...rest, previewImage: image }; }) }), strategy));
    }
  });
  async function refreshImages() {
    const result = await window.imageAssets.list();
    if (!result.ok) throw new Error(result.error);
    setImageAssets(result.value); return result.value;
  }
  async function configureImage(value: ImageAssetUpdate) {
    if (operating.current || runtime.active) throw new Error('请停止运行后配置资产。');
    const result = await window.imageAssets.update(value);
    if (!result.ok) throw new Error(result.error);
    setImageAssets(result.value); return result.value;
  }
  async function configureImageRobloxId(id: string, robloxId: string) {
    if (operating.current || runtime.active) throw new Error('请停止运行后配置资产。');
    const result = await window.imageAssets.updateRobloxId(id, robloxId);
    if (!result.ok) throw new Error(result.error);
    setImageAssets(result.value); return result.value;
  }
  async function importImage(library: ImageLibrary, file?: File) {
    const result = file ? await window.imageAssets.importFile(library, file) : await window.imageAssets.import(library);
    if (!result.ok) throw new Error(result.error);
    if (result.value) await refreshImages();
    return result.value;
  }
  function useImage(asset: ImageAsset, create = false) {
    if (!hasDocument) return;
    if (create || !selected.className.startsWith('Image')) {
      const node = applyImageAsset(strategy.createNode('ImageLabel'), asset);
      const parent = strategy.canParent(selected, node) ? selected : document.root;
      execute('插入图片资产', value => insertNode(value, parent.id, node, strategy)); select(node.id);
    } else editNode(selected.id, node => applyImageAsset(node, asset), '应用图片资产');
  }
  const editor = { projectId: project.manifest.id, projectName: project.name, projectPath: project.path, strategy, document, inspectionDocument, inspectionBusy: busy || assetsLoading || (runtime.active && !runtime.ready), hasDocument, history, selected, select, editNode, editProperty, execute, add, reparent, pickImage,
    inspectedAssetId, inspectAsset, clearAssetInspection, setAssetConfigurationDirty,
    imageAssets, assetsLoading, refreshImages, configureImage, configureImageRobloxId, importImage, useImage,
    newDocument, openDocument, openTemplate, saveTemplate, moveAsset, save: (saveAs = false) => run(async () => { await save(saveAs); }),
    saveProjectUI: () => run(async () => { await save(false, true); }), back, dirty, path, error, busy: busy || runtime.active || assetsLoading, runtime };
  useAutomation(editor, { reset, saved: () => fileState.current.saved, path: () => fileState.current.path, busy: value => { operating.current = value; setBusy(value); }, markSaved: (value, file) => { fileState.current = { path: file, saved: JSON.stringify(value) }; setPath(file); setSaved(fileState.current.saved); } });
  return editor;
}
export type DocumentEditor = ReturnType<typeof useDocumentEditor>;
