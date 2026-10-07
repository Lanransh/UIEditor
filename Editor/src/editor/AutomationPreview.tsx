import { useEffect, useState } from 'react';
import type { UIDocument, UINode } from '../shared/uiDocument';
import { DocumentPreview } from './Canvas';
import { robloxStrategy } from './roblox';

// Static saved-design rendering only: no editor, runtime or interaction scripts.
export function AutomationPreview() {
  const [document, setDocument] = useState<UIDocument | null>(null);
  useEffect(() => { void window.automation.invoke('preview:document').then(setDocument); }, []);
  useEffect(() => {
    if (!document) return;
    let alive = true;
    const images = new Set<string>();
    function collect(node: UINode) { if (node.previewImage) images.add(node.previewImage.dataUrl); node.children.forEach(collect); }
    collect(document.root);
    void (async () => {
      await Promise.all([...images].map(source => new Promise<void>(resolve => { const image = new Image(); image.onload = image.onerror = () => resolve(); image.src = source; })));
      await window.document.fonts.ready;
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (alive) await window.automation.invoke('preview:ready');
    })();
    return () => { alive = false; };
  }, [document]);
  return <div style={{ position: 'fixed', inset: 0, width: 1280, height: 720, overflow: 'hidden', background: '#fff' }}>
    {document && <DocumentPreview document={document} strategy={robloxStrategy} />}
  </div>;
}
