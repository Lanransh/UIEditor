import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeRuntimeBatch } from '../src/shared/runtime-batch';
import { validateTool, definitions } from '../src/shared/automation-tools';
import { robloxStrategy } from '../src/editor/roblox';
import type { RuntimeFrame } from '../src/shared/runtime';
import type { AutomationRequest } from '../src/shared/automation';

const stamp = { sessionId: 'session', revision: 1 };
function fixture() {
  const document = robloxStrategy.createDocument('Batch');
  const button = robloxStrategy.createNode('TextButton');
  document.root.children.push(button);
  button.properties.Text = 'Ready';
  let frame: RuntimeFrame | null = null;
  let hidden = false;
  const calls: AutomationRequest[] = [];
  const dispatch = async (request: AutomationRequest) => {
    calls.push(request);
    if (request.name === 'uie.debug.get_diagnostics') return { logs: [], cursor: 0 };
    if (request.name === 'uie.runtime.control') {
      frame = request.arguments.action === 'stop' ? null : { document: structuredClone(document), disabled: [], logs: [] };
      return { result: { ok: true } };
    }
    const reason = hidden ? 'hidden' : frame!.disabled.includes(button.id) ? 'disabled' : null;
    if (!reason) { frame!.document.root.children[0].properties.Text = 'Claimed'; frame!.disabled.push(button.id); }
    return { dispatched: !reason, reason, result: { ok: true } };
  };
  return { button, calls, dispatch, inspect: () => frame, hide: () => { hidden = true; } };
}

test('batch validates all steps before dispatch and is discoverable', async () => {
  assert.ok(definitions.find(tool => tool.name === 'uie.runtime.batch')?.inputSchema.required.includes('steps'));
  for (const steps of [
    [], Array(33).fill({ action: 'run' }), [{ action: 'click' }], [{ action: 'assert', id: 'id' }],
    [{ action: 'run', source: 'code' }], [{ action: 'stop', id: 'id' }],
    [{ action: 'click', id: 'id', reason: 'other' }], [{ action: 'assert', id: 'id', disabled: 1 }],
    [{ action: 'assert', id: 'id', properties: [] }], [{ action: 'run' }, { action: 'save' }],
    [{ action: 'assert', id: 'id', properties: { Text: Number.NaN } }],
  ]) {
    assert.throws(() => validateTool('uie.runtime.batch', { ...stamp, steps }));
    const f = fixture();
    await assert.rejects(executeRuntimeBatch({ ...stamp, steps }, f.dispatch, f.inspect, () => {}));
    assert.equal(f.calls.length, 0);
  }
  assert.throws(() => validateTool('uie.runtime.batch', { steps: [{ action: 'run' }] }), /sessionId/);
});

test('batch sequentially verifies claim, repeat click, reset and stop without modifying design', async () => {
  const f = fixture();
  const report = await executeRuntimeBatch({ ...stamp, steps: [
    { action: 'run' },
    { action: 'assert', id: f.button.id, properties: { Text: 'Ready' }, disabled: false },
    { action: 'click', id: f.button.id, dispatched: true, reason: null },
    { action: 'assert', id: f.button.id, properties: { Text: 'Claimed' }, disabled: true },
    { action: 'click', id: f.button.id, dispatched: false, reason: 'disabled' },
    { action: 'reset' },
    { action: 'assert', id: f.button.id, properties: { Text: 'Ready' }, disabled: false },
    { action: 'stop' },
  ] }, f.dispatch, f.inspect, () => {});
  assert.equal(report.success, true);
  assert.equal(report.results.length, 8);
  assert.equal(report.skipped, 0);
  assert.equal(f.inspect(), null);
  assert.equal(f.button.properties.Text, 'Ready');
  assert.deepEqual(f.calls.slice(0, -1).map(call => call.arguments), [
    { ...stamp, action: 'run' }, { ...stamp, id: f.button.id }, { ...stamp, id: f.button.id },
    { ...stamp, action: 'reset' }, { ...stamp, action: 'stop' },
  ]);
  assert.deepEqual(report.diagnostics, { logs: [], cursor: 0 });
});

test('hidden clicks can be asserted without dispatch', async () => {
  const f = fixture(); f.hide();
  const report = await executeRuntimeBatch({ ...stamp, steps: [{ action: 'run' }, { action: 'click', id: f.button.id, dispatched: false, reason: 'hidden' }] }, f.dispatch, f.inspect, () => {});
  assert.equal(report.success, true);
});

test('assertions stop on first failure, preserve evidence and skip later stop', async () => {
  const f = fixture();
  const report = await executeRuntimeBatch({ ...stamp, steps: [{ action: 'run' }, { action: 'assert', id: f.button.id, properties: { Text: 'Wrong' } }, { action: 'stop' }] }, f.dispatch, f.inspect, () => {});
  assert.equal(report.success, false);
  assert.equal(report.skipped, 1);
  assert.match(report.results[1].error!, /Text/);
  assert.deepEqual(report.results[1].result, { id: f.button.id, properties: { Text: 'Ready' }, disabled: false });
  assert.ok(f.inspect());
});

test('failed runtime operations and mismatched click expectations stop the batch', async () => {
  const f = fixture();
  const failed = await executeRuntimeBatch({ ...stamp, steps: [{ action: 'run' }, { action: 'stop' }] }, async request => request.name.endsWith('control') ? { result: { ok: false, error: 'syntax error' } } : { logs: [] }, f.inspect, () => {});
  assert.equal(failed.success, false);
  assert.equal(failed.skipped, 1);
  assert.match(failed.results[0].error!, /syntax error/);
  for (const expectation of [{ dispatched: false }, { reason: 'hidden' }]) {
    const report = await executeRuntimeBatch({ ...stamp, steps: [{ action: 'run' }, { action: 'click', id: f.button.id, ...expectation }, { action: 'stop' }] }, f.dispatch, f.inspect, () => {});
    assert.equal(report.success, false);
    assert.equal(report.skipped, 1);
  }
});

test('stale initial session rejects and mid-batch conflicts stop further actions', async () => {
  const f = fixture();
  await assert.rejects(executeRuntimeBatch({ ...stamp, steps: [{ action: 'run' }] }, f.dispatch, f.inspect, () => { throw new Error('revision changed'); }), /revision/);
  assert.equal(f.calls.length, 0);
  let stale = false;
  const report = await executeRuntimeBatch({ ...stamp, steps: [{ action: 'run' }, { action: 'click', id: f.button.id }] }, async request => {
    const value = await f.dispatch(request);
    if (request.name === 'uie.runtime.control') stale = true;
    return value;
  }, f.inspect, () => { if (stale) throw new Error('revision changed'); });
  assert.equal(report.success, false);
  assert.equal(report.skipped, 1);
  assert.equal(f.calls.some(call => call.name === 'uie.runtime.click'), false);
});

test('batch time budget stops further actions before the bridge timeout', async t => {
  let now = 0;
  t.mock.method(Date, 'now', () => now);
  const f = fixture();
  const report = await executeRuntimeBatch({ ...stamp, steps: [{ action: 'run' }, { action: 'click', id: f.button.id }, { action: 'stop' }] }, async request => {
    const result = await f.dispatch(request);
    now = 8000;
    return result;
  }, f.inspect, () => {});
  assert.equal(report.success, false);
  assert.match(report.results[1].error!, /8 秒/);
  assert.equal(report.skipped, 1);
  assert.equal(f.calls.some(call => call.name === 'uie.runtime.click'), false);
});

test('assertions reject missing runtime/nodes and compare structured properties independent of key order', async () => {
  const f = fixture();
  for (const steps of [
    [{ action: 'assert', id: f.button.id, disabled: false }],
    [{ action: 'run' }, { action: 'assert', id: 'missing', disabled: false }],
    [{ action: 'run' }, { action: 'assert', id: f.button.id, disabled: true }],
  ]) {
    const report = await executeRuntimeBatch({ ...stamp, steps }, f.dispatch, f.inspect, () => {});
    assert.equal(report.success, false);
  }
  const report = await executeRuntimeBatch({ ...stamp, steps: [
    { action: 'run' },
    { action: 'assert', id: f.button.id, properties: { Position: { y: { offset: 0, scale: 0 }, x: { offset: 0, scale: 0 } } } },
  ] }, f.dispatch, f.inspect, () => {});
  assert.equal(report.success, true);
});
