import { uiEditorCompSource } from '../src/shared/uiCompClass';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ToolkitClient } from '../electron/toolkit';
import { robloxStrategy } from '../src/editor/roblox';

test('Toolkit discovery keeps tokens private and submits only validated packages to loopback', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const client = new ToolkitClient(async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json(String(url).endsWith('/discover') ? { uiEditorImport: 1, projects: [
      { id: 'game', name: 'Roblox_Y1', placeId: '123', token: 'private-token' },
      { id: 'unconfigured', name: 'Other', placeId: '', token: 'other-token' },
    ] } : { id: 'a'.repeat(32), deliveryId: 'delivery', name: 'RewardsUI', status: 'awaiting_studio', message: 'waiting', scriptPath: 'Generated/RewardsUI', sourceClass: 'UI' });
  });
  assert.deepEqual(await client.discover(), [{ id: 'game', name: 'Roblox_Y1', placeId: '123' }]);
  const doc = robloxStrategy.createDocument('Rewards'); doc.root.name = 'RewardsUI';
  assert.equal((await client.submit('game', doc)).status, 'awaiting_studio');
  assert.equal(calls[1].url, 'http://127.0.0.1:34871/ui-editor/submit');
  assert.equal((calls[1].init?.headers as Record<string, string>).Authorization, 'Bearer private-token');
  assert.equal(JSON.parse(String(calls[1].init?.body)).format, 'ui-editor-import');
  assert.equal(JSON.parse(String(calls[1].init?.body)).scripts.shared, uiEditorCompSource);
  assert.ok(JSON.parse(String(calls[1].init?.body)).scripts.source.includes(doc.scripts.source));
  assert.equal(calls[1].init?.redirect, 'error');
  await assert.rejects(client.submit('unknown', doc), /连接已失效/);
  assert.equal(calls.length, 2);
});
test('old Toolkit and invalid models fail before an import is sent', async () => {
  const old = new ToolkitClient(async () => Response.json({ projects: [] }));
  await assert.rejects(old.discover(), /更新并重启/);
  let requests = 0;
  const client = new ToolkitClient(async () => { requests++; return Response.json({}); });
  await assert.rejects(client.submit('game', {}), /界面/);
  assert.equal(requests, 0);
});
