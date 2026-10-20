import { test } from 'node:test';
import assert from 'node:assert/strict';
import { robloxStrategy as strategy } from '../src/editor/roblox';
import { createBatchExportSnapshot, runSequentialExport } from '../src/editor/batchExport';
import { resolveImageAssets, type ImageAsset } from '../src/shared/imageAssets';
import type { RobloxImportTask } from '../src/shared/toolkit';
import type { UIDocument } from '../src/shared/uiDocument';

test('batch export loads, submits and waits for each interface in order, continuing after a rejected item', async () => {
  const events: string[] = [];
  const updates: string[] = [];
  let polling = 0;
  const documents = new Map<string, UIDocument>(['First', 'Broken', 'Last'].map(name => {
    const document = strategy.createDocument(name);
    document.root.name = name;
    return [`${name.toLowerCase()}.json`, document] as const;
  }));
  function task(id: string, status: RobloxImportTask['status'] = 'succeeded'): RobloxImportTask {
    return { id, deliveryId: id, name: id, status, message: status === 'succeeded' ? '已导入 Studio' : '等待 Studio 回执',
      scriptPath: `${id}.view.luau`, sourceClass: `C${id}View` };
  }

  const result = await runSequentialExport([
    { path: 'first.json', name: 'First' },
    { path: 'broken.json', name: 'Broken' },
    { path: 'last.json', name: 'Last' },
  ], {
    load: async path => {
      events.push(`load:${path}`);
      return documents.get(path)!;
    },
    validationError: document => document.root.name === 'Broken' ? '缺少 Roblox 图片 ID' : '',
    submit: async document => {
      assert.equal(document.root.name === 'Broken', false);
      events.push(`submit:${document.root.name}`);
      return task(document.root.name, 'awaiting_studio');
    },
    status: async current => {
      events.push(`status:${current.name}:${++polling}`);
      return task(current.name);
    },
    wait: async () => {},
    onUpdate: item => updates.push(`${item.name}:${item.status}`),
  });

  assert.deepEqual(events, [
    'load:first.json', 'submit:First', 'status:First:1',
    'load:broken.json',
    'load:last.json', 'submit:Last', 'status:Last:2',
  ]);
  assert.deepEqual(result.map(item => [item.name, item.status]), [
    ['First', 'succeeded'],
    ['Broken', 'failed'],
    ['Last', 'succeeded'],
  ]);
  assert.match(result[1].message, /缺少 Roblox 图片 ID/);
  assert.ok(updates.includes('First:waiting'));
  assert.ok(updates.includes('Broken:failed'));
  assert.ok(updates.includes('Last:succeeded'));
});

test('batch export keeps the current task pending after a polling error before advancing', async () => {
  const events: string[] = [];
  const updates: string[] = [];
  let polls = 0;
  const result = await runSequentialExport(['First', 'Last'].map(name => ({ name, path: `${name}.json` })), {
    load: async path => strategy.createDocument(path.slice(0, -5)),
    validationError: () => '',
    submit: async document => {
      events.push(`submit:${document.name}`);
      return { id: document.name, name: document.name, deliveryId: '', status: 'awaiting_studio', message: '', scriptPath: '', sourceClass: '' };
    },
    status: async task => {
      events.push(`status:${task.id}`);
      if (++polls === 1) throw new Error('连接中断');
      return { ...task, status: 'succeeded' };
    },
    wait: async () => {},
    onUpdate: item => updates.push(`${item.status}:${item.message}`),
  });
  assert.deepEqual(events, ['submit:First', 'status:First', 'status:First', 'submit:Last', 'status:Last']);
  assert.deepEqual(result.map(item => item.status), ['succeeded', 'succeeded']);
  assert.ok(updates.some(message => message.startsWith('waiting:') && message.includes('连接中断')));
});

test('batch export continues after file and terminal Studio failures', async () => {
  const submitted: string[] = [];
  const result = await runSequentialExport(['Unreadable', 'Failed', 'Cancelled', 'Last'].map(name => ({ name, path: name })), {
    load: async path => {
      if (path === 'Unreadable') throw new Error('文件已删除');
      return strategy.createDocument(path);
    },
    validationError: () => '',
    submit: async document => {
      submitted.push(document.name);
      return { id: document.name, name: document.name, deliveryId: '', status: 'awaiting_studio', message: '', scriptPath: '', sourceClass: '' };
    },
    status: async task => ({ ...task, status: task.id === 'Failed' ? 'failed' : task.id === 'Cancelled' ? 'cancelled' : 'succeeded' }),
    wait: async () => {},
    onUpdate: () => {},
  });
  assert.deepEqual(submitted, ['Failed', 'Cancelled', 'Last']);
  assert.deepEqual(result.map(item => item.status), ['failed', 'failed', 'failed', 'succeeded']);
  assert.equal(result[0].message, '文件已删除');
  assert.equal(result[2].message, '导出已取消');
});

const assets = ['First', 'Last'].map(name => ({ name, path: name }));
const pendingTask = (id: string): RobloxImportTask => ({ id, name: id, deliveryId: id, status: 'awaiting_studio', message: '', scriptPath: '', sourceClass: '' });

test('a lost submission response pauses the queue and retries the saved snapshot before advancing', async () => {
  const submitted: UIDocument[] = [];
  const hooks = {
    load: async (path: string) => strategy.createDocument(path),
    validationError: () => '',
    submit: async (document: UIDocument) => {
      submitted.push(document);
      if (submitted.length === 1) throw new Error('响应丢失');
      return pendingTask(document.name);
    },
    status: async (task: RobloxImportTask) => ({ ...task, status: 'succeeded' as const }),
    wait: async () => {}, onUpdate: () => {},
  };
  const paused = await runSequentialExport(assets, hooks);
  assert.deepEqual(submitted.map(document => document.name), ['First']);
  assert.deepEqual(paused.map(item => item.status), ['uncertain', 'skipped']);
  assert.equal(paused[0].document, submitted[0]);
  assert.match(paused[0].message, /响应丢失/);
  const resumed = await runSequentialExport(paused, { ...hooks, load: async path => {
    assert.equal(path, 'Last', 'the unresolved submission must retain its snapshot');
    return strategy.createDocument(path);
  } });
  assert.equal(submitted[1], submitted[0]);
  assert.deepEqual(resumed.map(item => item.status), ['succeeded', 'succeeded']);
});

test('stopping while loading prevents submission and all later loads', async () => {
  const controller = new AbortController();
  const loaded: string[] = [];
  const result = await runSequentialExport(assets, {
    signal: controller.signal,
    load: async path => { loaded.push(path); controller.abort(); return strategy.createDocument(path); },
    validationError: () => '',
    submit: async () => { assert.fail('must not submit after stop'); },
    status: async () => { assert.fail('must not poll after stop'); },
    onUpdate: () => {},
  });
  assert.deepEqual(loaded, ['First']);
  assert.deepEqual(result.map(item => item.status), ['skipped', 'skipped']);
});

test('stopping during submission retains the returned task and resumes without resubmitting it', async () => {
  const controller = new AbortController();
  const task = pendingTask('First');
  const paused = await runSequentialExport(assets, {
    signal: controller.signal,
    load: async path => strategy.createDocument(path), validationError: () => '',
    submit: async () => { controller.abort(); return task; },
    status: async () => { assert.fail('must not poll after stop'); },
    onUpdate: () => {},
  });
  assert.deepEqual(paused.map(item => item.status), ['stopped', 'skipped']);
  assert.equal(paused[0].task, task);
  const events: string[] = [];
  const resumed = await runSequentialExport(paused, {
    load: async path => { events.push(`load:${path}`); return strategy.createDocument(path); },
    validationError: () => '',
    submit: async document => { events.push(`submit:${document.name}`); return pendingTask(document.name); },
    status: async task => { events.push(`status:${task.id}`); return { ...task, status: 'succeeded' }; },
    wait: async () => {}, onUpdate: () => {},
  });
  assert.deepEqual(events, ['status:First', 'load:Last', 'submit:Last', 'status:Last']);
  assert.deepEqual(resumed.map(item => item.status), ['succeeded', 'succeeded']);
});

test('stopping interrupts the polling timer without querying or advancing', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = new AbortController();
  let waiting!: () => void;
  const ready = new Promise<void>(resolve => { waiting = resolve; });
  const result = runSequentialExport(assets, {
    signal: controller.signal,
    load: async path => strategy.createDocument(path), validationError: () => '',
    submit: async () => pendingTask('First'),
    status: async () => { assert.fail('poll timer must be cleared'); },
    onUpdate: item => { if (item.status === 'waiting') waiting(); },
  });
  await ready;
  controller.abort();
  assert.deepEqual((await result).map(item => item.status), ['stopped', 'skipped']);
  t.mock.timers.tick(10000);
});

test('export snapshots retain image IDs on retry without modifying the saved UI', () => {
  const document = strategy.createDocument('First');
  const image = strategy.createNode('ImageLabel');
  const asset: ImageAsset = { id: 'icon', platform: 'roblox', library: 'project', name: 'Icon', tags: '', usage: 'image',
    previewImage: { name: 'Icon', dataUrl: 'data:image/png;base64,AAAA' }, robloxId: 'rbxassetid://123' };
  image.imageAssetId = asset.id;
  document.root.children.push(image);
  const snapshot = createBatchExportSnapshot(document, [asset]);
  assert.equal(snapshot.root.children[0].properties.Image, 'rbxassetid://123');
  assert.equal(resolveImageAssets(snapshot, [{ ...asset, robloxId: 'rbxassetid://456' }]).root.children[0].properties.Image, 'rbxassetid://123');
  assert.equal(image.imageAssetId, 'icon');
  assert.equal(image.properties.Image, '');
});

test('an aborted resume preserves unresolved submission and task information', async () => {
  const controller = new AbortController();
  controller.abort();
  const document = strategy.createDocument('First');
  const result = await runSequentialExport([
    { ...assets[0], document }, { ...assets[1], task: pendingTask('Last') },
  ], {
    signal: controller.signal,
    load: async () => { assert.fail('aborted resume must not load'); },
    validationError: () => '',
    submit: async () => { assert.fail('aborted resume must not submit'); },
    status: async () => { assert.fail('aborted resume must not poll'); },
    onUpdate: () => {},
  });
  assert.deepEqual(result.map(item => item.status), ['uncertain', 'stopped']);
  assert.equal(result[0].document, document);
  assert.equal(result[1].task?.id, 'Last');
});

test('a failed retry preflight cannot discard an unresolved submission', async () => {
  const document = strategy.createDocument('First');
  const result = await runSequentialExport([{ ...assets[0], document }, assets[1]], {
    load: async () => { assert.fail('must retain the original snapshot'); },
    validationError: () => '暂时无法确认图片配置',
    submit: async () => { assert.fail('must not submit after validation fails'); },
    status: async () => { assert.fail('no task ID is available'); },
    onUpdate: () => {},
  });
  assert.deepEqual(result.map(item => item.status), ['uncertain', 'skipped']);
  assert.equal(result[0].document, document);
});


test('freezing export snapshots cannot hide unconfigured image references', () => {
  const document = strategy.createDocument('MissingImage');
  const image = strategy.createNode('ImageLabel'); image.imageAssetId = 'missing';
  document.root.children.push(image);
  const snapshot = createBatchExportSnapshot(document, []);
  assert.equal(snapshot.root.children[0].imageAssetId, 'missing');
});
