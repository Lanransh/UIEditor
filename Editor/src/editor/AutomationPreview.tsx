import { useEffect, useState } from 'react';
import type { UIDocument, UINode } from '../shared/uiDocument';
import { findNode } from '../shared/uiDocument';
import { DocumentPreview } from './Canvas';
import { robloxStrategy } from './roblox';
import { imagePreviewResolver, type ImageAsset, type BakePreviewConfig } from '../shared/imageAssets';

// Static saved-design rendering only: no editor, runtime or interaction scripts.
export function AutomationPreview() {
  const [document, setDocument] = useState<UIDocument | null>(null);
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [bake, setBake] = useState<BakePreviewConfig | null>(null);
  useEffect(() => { void Promise.all([window.automation.invoke('preview:document'), window.automation.invoke('preview:config'), window.automation.invoke('preview:assets')]).then(([document, config, assets]) => { setAssets(assets); setBake(config); setDocument(document); }); }, []);
  useEffect(() => {
    if (!document) return;
    let alive = true;
    const images = new Set<string>();
    const previewFor = imagePreviewResolver(assets);
    function collect(node: UINode) { const preview = previewFor(node); if (preview) images.add(preview.dataUrl); else if (bake && node.className.startsWith('Image') && (node.properties.Image || node.imageAssetId)) throw new Error(`图片 ${node.name} 在图片库中缺少本地图片，无法烘焙。`); node.children.forEach(collect); }
    void (async () => {
      collect((bake && findNode(document.root, bake.nodeId)) || document.root);
      await Promise.all([...images].map(source => new Promise<void>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(); image.onerror = () => bake ? reject(new Error('预览图片无法加载，无法烘焙。')) : resolve(); image.src = source; })));
      await window.document.fonts.ready;
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (!alive) return;
      if (bake) {
        const source = [...window.document.querySelectorAll<HTMLElement>('[data-node-id]')].find(element => element.dataset.nodeId === bake.nodeId);
        if (!source) throw new Error('节点或其父节点不可见，无法烘焙。');
        const width = parseFloat(source.style.width), height = parseFloat(source.style.height);
        if (!(width > 0 && height > 0)) throw new Error('节点尺寸为零，无法烘焙。');
        const clone = source.cloneNode(true) as HTMLElement;
        const computed = window.getComputedStyle(source);
        const padding = computed.outlineStyle === 'none' ? 0 : parseFloat(computed.outlineWidth) || 0;
        const scaleX = bake.width / (width + padding * 2), scaleY = bake.height / (height + padding * 2);
        // Layout is calculated in the complete document before extraction. The
        // replacement keeps its own rotation and UIScale, so neither is baked.
        // CSS outlines extend beyond the box; fit them into the output as well.
        Object.assign(clone.style, { left: '0px', top: '0px', transform: `translate(${padding * scaleX}px, ${padding * scaleY}px) scale(${scaleX}, ${scaleY})`, transformOrigin: '0 0' });
        const viewport = window.document.createElement('div');
        Object.assign(viewport.style, { position: 'fixed', inset: '0', width: `${bake.width}px`, height: `${bake.height}px`, overflow: 'hidden', background: 'transparent' });
        viewport.append(clone);
        window.document.getElementById('root')!.replaceChildren();
        window.document.documentElement.style.background = 'transparent';
        window.document.body.style.background = 'transparent';
        window.document.body.append(viewport);
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      }
      if (alive) await window.automation.invoke('preview:ready');
    })().catch(error => { if (alive) void window.automation.invoke('preview:error', error instanceof Error ? error.message : String(error)); });
    return () => { alive = false; };
  }, [document, bake, assets]);
  return <div style={{ position: 'fixed', inset: 0, width: 1280, height: 720, overflow: 'hidden', background: '#fff' }}>
    {document && <DocumentPreview document={document} imageAssets={assets} strategy={robloxStrategy} />}
  </div>;
}
