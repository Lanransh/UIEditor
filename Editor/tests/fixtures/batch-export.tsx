import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { BatchExportMenu } from '../../src/editor/BatchExportMenu';
import { robloxStrategy as strategy } from '../../src/editor/roblox';
import type { DocumentEditor } from '../../src/editor/useDocumentEditor';
import type { DocumentAPI } from '../../src/shared/documents';
import type { ImageAsset } from '../../src/shared/imageAssets';
import type { ToolkitAPI } from '../../src/shared/toolkit';
import type { UIDocument } from '../../src/shared/uiDocument';
import '../../src/styles.css';

const first = strategy.createDocument('FirstUI');
first.root.name = 'FirstUI';
const imageAsset: ImageAsset = { id: 'icon', platform: 'roblox', library: 'project', name: 'Icon', tags: '',
  previewImage: { name: 'Icon', dataUrl: 'data:image/png;base64,AAAA' }, robloxId: 'rbxassetid://123', usage: 'image' };
const icon = strategy.createNode('ImageLabel');
icon.imageAssetId = imageAsset.id;
first.root.children.push(icon);
const second = strategy.createDocument('SecondUI');
second.root.name = 'SecondUI';
const documents = new Map([
  ['C:/Project/interfaces/FirstUI.rbxui.json', first],
  ['C:/Project/interfaces/SecondUI.rbxui.json', second],
]);
const state = { submitted: [] as string[], polls: [] as string[], events: [] as string[], receivedImageId: '', failFirst: false, multipleTargets: false,
  hold: false, failPoll: false, loseResponse: false, cancelError: false, holdDiscovery: false, discoveryStarted: false, releaseDiscovery: () => {},
  unmount: () => {}, changeImageId: (id: string) => { imageAsset.robloxId = id; } };
(window as unknown as { batchExportQA: typeof state }).batchExportQA = state;

window.documents = {
  listAssets: async () => ({ ok: true, value: [
    { name: 'FirstUI', path: 'C:/Project/interfaces/FirstUI.rbxui.json' },
    { name: 'SecondUI', path: 'C:/Project/interfaces/SecondUI.rbxui.json' },
  ] }),
  previewAsset: async (path: string) => {
    const document = documents.get(path);
    return document ? { ok: true, value: { path, document } } : { ok: false, error: '缺少界面' };
  },
} as unknown as DocumentAPI;

window.toolkit = {
  discover: async () => {
    state.discoveryStarted = true;
    if (state.holdDiscovery) await new Promise<void>(resolve => { state.releaseDiscovery = resolve; });
    return { ok: true, value: [{ id: 'target', name: 'Game', placeId: '123' },
      ...(state.multipleTargets ? [{ id: 'other', name: 'Other', placeId: '456' }] : [])] };
  },
  submit: async (_targetId: string, document: UIDocument) => {
    const name = document.root.name;
    if (name === 'FirstUI') state.receivedImageId = String(document.root.children[0].properties.Image);
    state.submitted.push(name);
    state.events.push(`submit:${name}`);
    if (state.loseResponse) { state.loseResponse = false; return { ok: false, error: '提交响应丢失' }; }
    return { ok: true, value: {
      id: name, deliveryId: name, name, status: 'awaiting_studio', message: '等待 Studio 回执',
      scriptPath: `Generated/C${name}View.luau`, sourceClass: `C${name}View`,
    } };
  },
  task: async (targetId: string, taskId: string, action: string) => {
    if (targetId !== 'target' || !documents.has(`C:/Project/interfaces/${taskId}.rbxui.json`) || !['status', 'cancel'].includes(action)) throw new Error('任务查询参数错误');
    state.polls.push(taskId);
    state.events.push(`${action}:${taskId}`);
    if (action === 'status' && state.failPoll) return { ok: false, error: '查询连接中断' };
    if (action === 'cancel' && state.cancelError) return { ok: false, error: '取消失败' };
    const failed = state.failFirst && taskId === 'FirstUI';
    return { ok: true, value: { id: taskId, name: taskId, deliveryId: taskId,
      status: action === 'cancel' ? 'cancelled' : state.hold ? 'awaiting_studio' : failed ? 'failed' : 'succeeded',
      message: action === 'cancel' ? '任务已取消' : state.hold ? '等待 Studio' : failed ? 'Studio 拒绝导入' : 'UI 已导入 Studio',
      scriptPath: `Generated/C${taskId}View.luau`, sourceClass: `C${taskId}View` } };
  },
} as unknown as ToolkitAPI;

const editor = {
  projectPath: 'C:/Project',
  path: 'C:/Project/interfaces/FirstUI.rbxui.json',
  documentAssetRevision: 0,
  imageAssets: [imageAsset],
  inspectImages: () => [imageAsset],
  busy: false,
} as unknown as DocumentEditor;

function Fixture() {
  const [open, setOpen] = useState(true);
  state.unmount = () => setOpen(false);
  return open ? <main className="workspace">
    <header className="workspace-toolbar"><BatchExportMenu editor={editor} /></header>
  </main> : <p>已返回 Hub</p>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
