import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ToolkitClient, toolkitProjectId } from '../electron/toolkit';
import { readPreviewImage } from '../electron/documents';

const taskId = 'a'.repeat(32);
const processing = { taskId, status: 'processing', message: '处理中', pollAfterMs: 3000 };
const success = { ...processing, status: 'succeeded', robloxId: 'rbxassetid://123456789012345', assetType: 'Image', gameAccess: 'not_verified' };
const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
async function fixture() {
  await mkdir('test-results', { recursive: true });
  const root = await mkdtemp(resolve('test-results/image-upload-'));
  const ui = join(root, 'UIEditorWorkspace'), toolkit = join(root, 'GameKitWorkspace');
  await mkdir(ui); await mkdir(toolkit);
  return { root, ui, toolkit };
}
test('sibling Toolkit is matched by path ID, never display name or sole unrelated target', async () => {
  const { root, ui, toolkit } = await fixture();
  const id = toolkitProjectId(toolkit);
  const client = new ToolkitClient(async () => Response.json({ protocol: 3, uiEditorImport: 1, uiEditorImageUpload: 1,
    projects: [{ id, name: 'Renamed', placeId: '123', token: 'secret' }, { id: 'other', name: 'Same', placeId: '456', token: 'other' }] }));
  const found = await client.imageTargets(ui);
  assert.equal(found.automaticTargetId, id);
  assert.equal(JSON.stringify(found).includes('secret'), false);
  assert.equal((await client.imageTargets(join(root, 'nested', 'UIEditorWorkspace'))).automaticTargetId, '');
  if (process.platform === 'win32') assert.equal(toolkitProjectId(toolkit.toUpperCase()), id);
});
test('image capability is required without breaking existing import discovery', async () => {
  const client = new ToolkitClient(async () => Response.json({ protocol: 3, uiEditorImport: 1, projects: [] }));
  assert.deepEqual(await client.discover(), []);
  await assert.rejects(client.imageTargets('UIEditorWorkspace'), /更新并重启/);
});
test('upload and queries use private connection headers and validate final Image references', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  let response: unknown = processing;
  const client = new ToolkitClient(async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json(String(url).endsWith('/discover') ? { protocol: 3, uiEditorImport: 1, uiEditorImageUpload: 1,
      projects: [{ id: 'game', name: 'Game', placeId: '123', token: 'secret' }] } : response);
  });
  await client.discover();
  assert.deepEqual(await client.uploadImage('game', 'Icon', dataUrl), processing);
  assert.equal(calls[1].url, 'http://127.0.0.1:34871/ui-editor/image-upload');
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { name: 'Icon', dataUrl });
  const headers = calls[1].init?.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer secret'); assert.equal(headers['X-SGT-Place-Id'], '123');
  assert.equal(headers.Origin, undefined); assert.equal(calls[1].init?.redirect, 'error');
  response = success;
  assert.equal((await client.imageTask('game', taskId)).robloxId, success.robloxId);
  assert.equal(calls[2].url, 'http://127.0.0.1:34871/ui-editor/image-upload-task');
  for (const invalid of [{ ...success, assetType: 'Decal' }, { ...success, robloxId: 'rbxassetid://0' },
    { ...processing, pollAfterMs: 0 }, { ...processing, status: 'unknown' }]) {
    response = invalid;
    await assert.rejects(client.imageTask('game', taskId), /响应无效/);
  }
  const count = calls.length;
  await assert.rejects(client.imageTask('game', '../task'), /ID 无效/);
  await assert.rejects(client.uploadImage('game', 'Icon', `data:image/png;base64,${Buffer.alloc(8 * 1024 * 1024 + 1).toString('base64')}`), /8 MiB/);
  assert.equal(calls.length, count);
});
test('local image reading accepts exactly 8 MiB and rejects one byte more', async () => {
  const { root } = await fixture();
  const file = join(root, 'image.png'), bytes = Buffer.alloc(8 * 1024 * 1024);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  await writeFile(file, bytes);
  assert.ok((await readPreviewImage(file)).dataUrl.startsWith('data:image/png;base64,'));
  await writeFile(file, Buffer.concat([bytes, Buffer.from([0])]));
  await assert.rejects(readPreviewImage(file), /8 MiB/);
});
