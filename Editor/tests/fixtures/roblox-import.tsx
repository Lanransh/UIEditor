import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RobloxImportDialog } from '../../src/editor/RobloxImportDialog';
import { robloxStrategy } from '../../src/editor/roblox';
import { resolveImageAssets, type ImageAsset } from '../../src/shared/imageAssets';
import type { RobloxImportTask } from '../../src/shared/toolkit';
import type { UIDocument } from '../../src/shared/uiDocument';
import '../../src/styles.css';

const ui = robloxStrategy.createDocument('Rewards'); ui.root.name = 'RewardsUI';
const trainingPreview = { name: 'TrainingIcon', dataUrl: 'data:image/png;base64,AAAA' };
const trainingAsset: ImageAsset = { id: 'training', platform: 'roblox', library: 'project', name: 'TrainingIcon', tags: '', previewImage: trainingPreview, robloxId: '', usage: 'image' };
const training = robloxStrategy.createNode('ImageLabel'); training.name = 'TrainingIcon'; training.imageAssetId = trainingAsset.id; training.previewImage = trainingPreview; ui.root.children.push(training);
const money = robloxStrategy.createNode('ImageLabel'); money.name = 'MoneyIcon'; money.previewImage = { name: 'MoneyIcon', dataUrl: 'data:image/png;base64,BBBB' }; ui.root.children.push(money);
let current: RobloxImportTask = { id: 'a'.repeat(32), deliveryId: 'delivery', name: 'RewardsUI', status: 'awaiting_studio', message: '等待 Studio 回执', scriptPath: 'Client/UI/Generated/RewardsUI', sourceClass: 'CRewardsUIBaseCompClass' };
const state = { submitted: 0, uploaded: [] as string[], received: null as UIDocument | null, failDiscovery: false, failTask: false, multipleTargets: false, submitError: '', targetAvailable: true, failReceipt: () => { current = { ...current, status: 'failed', message: 'Studio 导入失败' }; }, succeed: () => { current = { ...current, status: 'succeeded', message: 'UI 已导入 Studio' }; } };
(window as unknown as { importQA: typeof state }).importQA = state;
window.toolkit = {
  imageTargets: async () => ({ ok: true, value: { targets: [{ id: 'game', name: 'Roblox_Y1', placeId: '123' }], automaticTargetId: 'game' } }),
  uploadImage: async (target, image) => {
    if (target !== 'game') throw new Error('Wrong image target');
    state.uploaded.push(image.name);
    return { ok: true, value: { taskId: state.uploaded.length.toString(16).padStart(32, '0'), status: 'succeeded', message: '上传完成', pollAfterMs: 3000, robloxId: `rbxassetid://${100 + state.uploaded.length}` } };
  },
  imageTask: async () => ({ ok: false, error: '此测试不上传图片' }),
  discover: async () => state.failDiscovery ? { ok: false, error: '后台未启动' } : { ok: true, value: state.multipleTargets ? [{ id: 'game', name: 'Roblox_Y1', placeId: '123' }, { id: 'other', name: 'Other', placeId: '456' }] : state.targetAvailable ? [{ id: 'game', name: 'Roblox_Y1', placeId: '123' }] : [{ id: 'other', name: 'Other', placeId: '456' }] },
  submit: async (target, document) => {
    if (state.submitError) return { ok: false, error: state.submitError };
    if (target !== 'game' || document.root.name !== 'RewardsUI') throw new Error('Wrong snapshot');
    if (document.root.children.some(node => node.className.startsWith('Image') && !node.properties.Image)) throw new Error('Image IDs missing');
    state.received = document; state.submitted++; return { ok: true, value: { ...current } };
  },
  task: async (target, id, action) => {
    if (target !== 'game' || id !== current.id) throw new Error('Wrong task');
    if (action === 'cancel') current = { ...current, status: 'cancelled', message: '已取消等待' };
    if (action === 'retry') current = { ...current, status: 'awaiting_studio', message: '等待 Studio 回执' };
    return state.failTask ? { ok: false, error: '连接已失效' } : { ok: true, value: { ...current } };
  },
};
function Fixture() {
  const [open, setOpen] = useState(true);
  const [document, setDocument] = useState(ui);
  const [assets, setAssets] = useState([trainingAsset]);
  return open ? <RobloxImportDialog document={resolveImageAssets(document, assets)} imageAssets={assets} saveAssetId={async (id, robloxId) => {
    setAssets(current => current.map(asset => asset.id === id ? { ...asset, robloxId } : asset));
  }} assignNodeIds={(ids, robloxId) => {
    setDocument(currentDocument => {
      const next = structuredClone(currentDocument);
      for (const node of next.root.children) if (ids.includes(node.id)) node.properties.Image = robloxId;
      state.received = next;
      return next;
    });
  }} onClose={() => setOpen(false)} /> : <p>已关闭</p>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
