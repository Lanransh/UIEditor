import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ImageUploadDialog } from '../../src/editor/ImageUploadDialog';
import type { ImageAsset } from '../../src/shared/imageAssets';
import type { ImageUploadTask } from '../../src/shared/toolkit';
import '../../src/styles.css';

const state = {
  mode: new URLSearchParams(location.search).get('mode') || 'offline',
  discoveries: 0, submissions: 0, queries: 0, saved: '',
  available: true, failQuery: false, uploadFailure: '',
  selected: '', pending: false, release: () => {},
};
(window as unknown as { uploadQA: typeof state }).uploadQA = state;
const task: ImageUploadTask = { taskId: 'a'.repeat(32), status: 'processing', message: '处理中', pollAfterMs: 3000 };
window.toolkit = {
  imageTargets: async () => {
    state.discoveries++;
    if (state.pending) await new Promise<void>(resolve => { state.release = resolve; });
    if (state.mode === 'offline') return { ok: false, error: '无法连接 StudioGameToolkit' };
    if (state.mode === 'old') return { ok: false, error: '请更新并重启 StudioGameToolkit，当前服务不支持图片上传。' };
    return { ok: true, value: {
      automaticTargetId: state.mode === 'manual' || !state.available ? '' : 'game',
      targets: state.mode === 'empty' ? [] : [
        ...(state.available ? [{ id: 'game', name: 'Game', placeId: '123' }] : []),
        { id: 'other', name: 'Other', placeId: '456' },
      ],
    } };
  },
  uploadImage: async id => {
    state.submissions++; state.selected = id;
    return { ok: true, value: state.uploadFailure ? { ...task, status: 'failed', message: state.uploadFailure } : { ...task } };
  },
  imageTask: async (id, taskId) => {
    if (id !== state.selected || taskId !== task.taskId) throw new Error('Wrong target or task');
    state.queries++;
    return state.failQuery ? { ok: false, error: '连接已失效，请重新连接工程' } :
      { ok: true, value: { ...task, status: 'succeeded', message: '成功', robloxId: 'rbxassetid://123' } };
  },
  discover: async () => ({ ok: false, error: '此测试不导入 UI' }),
  submit: async () => ({ ok: false, error: '此测试不导入 UI' }),
  task: async () => ({ ok: false, error: '此测试不导入 UI' }),
};
const asset: ImageAsset = { id: 'icon', platform: 'roblox', library: 'project', name: 'Icon', tags: '',
  robloxId: '', usage: 'image', previewImage: { name: 'Icon', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' } };
function Fixture() {
  const [open, setOpen] = useState(true);
  return <><button onClick={() => setOpen(false)}>卸载测试弹窗</button>{open ?
    <ImageUploadDialog image={{ assetId: asset.id, name: asset.name }} saveId={async id => { state.saved = id; }} onClose={() => setOpen(false)} /> : <p>已关闭</p>}</>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
