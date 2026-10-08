import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RobloxImportDialog } from '../../src/editor/RobloxImportDialog';
import { robloxStrategy } from '../../src/editor/roblox';
import type { RobloxImportTask } from '../../src/shared/toolkit';
import '../../src/styles.css';

const ui = robloxStrategy.createDocument('Rewards'); ui.root.name = 'RewardsUI';
let current: RobloxImportTask = { id: 'a'.repeat(32), deliveryId: 'delivery', name: 'RewardsUI', status: 'awaiting_studio', message: '等待 Studio 回执', scriptPath: 'Client/UI/Generated/RewardsUI', sourceClass: 'CRewardsUIBaseCompClass' };
const state = { submitted: 0, failDiscovery: false, failTask: false, succeed: () => { current = { ...current, status: 'succeeded', message: 'UI 已导入 Studio' }; } };
(window as unknown as { importQA: typeof state }).importQA = state;
window.toolkit = {
  imageTargets: async () => ({ ok: false, error: '此测试不上传图片' }),
  uploadImage: async () => ({ ok: false, error: '此测试不上传图片' }),
  imageTask: async () => ({ ok: false, error: '此测试不上传图片' }),
  discover: async () => state.failDiscovery ? { ok: false, error: '后台未启动' } : { ok: true, value: [{ id: 'game', name: 'Roblox_Y1', placeId: '123' }] },
  submit: async (target, document) => {
    if (target !== 'game' || document.root.name !== 'RewardsUI') throw new Error('Wrong snapshot');
    state.submitted++; return { ok: true, value: { ...current } };
  },
  task: async (target, id, action) => {
    if (target !== 'game' || id !== current.id) throw new Error('Wrong task');
    if (action === 'cancel') current = { ...current, status: 'cancelled', message: '已取消等待' };
    if (action === 'retry') current = { ...current, status: 'awaiting_studio' };
    return state.failTask ? { ok: false, error: '连接已失效' } : { ok: true, value: { ...current } };
  },
};
function Fixture() {
  const [open, setOpen] = useState(true);
  return open ? <RobloxImportDialog document={ui} onClose={() => setOpen(false)} /> : <p>已关闭</p>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
