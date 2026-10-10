import { uiEditorCompSource } from '../src/shared/uiCompClass';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ToolkitClient } from '../electron/toolkit';
import { robloxStrategy } from '../src/editor/roblox';
import { setImmediate } from 'node:timers/promises';

test('Toolkit discovery keeps tokens private and submits only validated packages to loopback', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const client = new ToolkitClient(async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json(String(url).endsWith('/discover') ? { protocol: 3, uiEditorImport: 1, projects: [
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

test('startup connection retries every five seconds without a project or dialog and stops on success', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let requests = 0, online = false;
  const client = new ToolkitClient(async () => {
    requests++;
    if (!online) throw new Error('offline');
    return Response.json({ protocol: 3, uiEditorImport: 1, projects: [{ id: 'game', name: 'Game', placeId: '123', token: 'secret' }] });
  });
  t.after(() => client.stopConnection());
  client.startConnection(); client.startConnection(); await setImmediate();
  assert.equal(requests, 1);
  t.mock.timers.tick(4999); await setImmediate(); assert.equal(requests, 1);
  t.mock.timers.tick(1); await setImmediate(); assert.equal(requests, 2);
  online = true;
  t.mock.timers.tick(5000); await setImmediate(); assert.equal(requests, 3);
  t.mock.timers.tick(15000); await setImmediate(); assert.equal(requests, 3);
});

test('discovery shares in-flight startup requests and waits for a configured game', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let requests = 0, release!: (value: Response) => void;
  const client = new ToolkitClient(async () => { requests++; return new Promise<Response>(resolve => { release = resolve; }); });
  t.after(() => client.stopConnection());
  client.startConnection();
  const manual = client.discover();
  assert.equal(client.discover(), manual);
  t.mock.timers.tick(15000); assert.equal(requests, 1);
  release(Response.json({ protocol: 3, uiEditorImport: 1, projects: [] })); await manual;
  t.mock.timers.tick(4999); assert.equal(requests, 1);
  t.mock.timers.tick(1); assert.equal(requests, 2);
  client.stopConnection();
  release(Response.json({ protocol: 3, uiEditorImport: 1, projects: [] })); await setImmediate();
  t.mock.timers.tick(15000); assert.equal(requests, 2);
});

test('stopping while offline or during an in-flight connection prevents further retries', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let requests = 0, reject!: (error: Error) => void;
  const client = new ToolkitClient(async () => { requests++; return new Promise<Response>((_resolve, fail) => { reject = fail; }); });
  client.startConnection(); client.stopConnection();
  reject(new Error('offline')); await setImmediate();
  t.mock.timers.tick(15000); assert.equal(requests, 1);
  client.startConnection(); reject(new Error('offline')); await setImmediate();
  client.stopConnection(); t.mock.timers.tick(15000); assert.equal(requests, 2);
});

test('a lost upload connection restarts retries and refreshes the private token without resubmitting', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let online = true, token = 'old', discoveries = 0, uploads = 0, authorization = '';
  const client = new ToolkitClient(async (url, init) => {
    if (String(url).endsWith('/discover')) {
      discoveries++;
      if (!online) throw new Error('offline');
      return Response.json({ protocol: 3, uiEditorImport: 1, uiEditorImageUpload: 1,
        projects: [{ id: 'game', name: 'Game', placeId: '123', token }] });
    }
    uploads++; authorization = (init?.headers as Record<string, string>).Authorization;
    if (!online) throw new Error('offline');
    return Response.json({ taskId: 'a'.repeat(32), status: 'processing', message: '处理中', pollAfterMs: 3000 });
  });
  t.after(() => client.stopConnection());
  client.startConnection(); await setImmediate();
  online = false;
  await assert.rejects(client.uploadImage('game', 'Icon', 'data:image/png;base64,iVBORw0KGgo='), /无法连接/);
  t.mock.timers.tick(5000); await setImmediate(); assert.equal(discoveries, 2);
  online = true; token = 'new';
  t.mock.timers.tick(5000); await setImmediate(); assert.equal(discoveries, 3); assert.equal(uploads, 1);
  await client.uploadImage('game', 'Icon', 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(authorization, 'Bearer new');
});


test('protocol 2 imports are rejected before submitting to the old script writer', async () => {
  const client = new ToolkitClient(async () => Response.json({ protocol: 2, uiEditorImport: 1, projects: [] }));
  await assert.rejects(client.discover(), /更新并重启/);
});
