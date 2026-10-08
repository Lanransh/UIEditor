import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { LuauSession } from '../electron/runtime';
import { RuntimeMouse, runtimeGeometry, localMousePoint } from '../src/editor/runtimeMouse';
import { robloxStrategy } from '../src/editor/roblox';
import { findNode } from '../src/shared/uiDocument';
import { validateTool } from '../src/shared/automation-tools';
import { mouseFixture } from './runtime-mouse-fixture';

test('mouse tools reject malformed actions before execution', () => {
  const stamp = { sessionId: 's', revision: 0, id: 'n' };
  for (const args of [{}, { to: {} }, { to: { y: Infinity } }, { to: { y: 1 }, delta: { y: 1 } }, { delta: { z: 1 } }]) assert.throws(() => validateTool('uie.runtime.scroll', { ...stamp, ...args }));
  for (const args of [{}, { from: { x: -1, y: 0 }, to: { x: 1, y: 1 } }, { from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, steps: 33 }]) assert.throws(() => validateTool('uie.runtime.drag', { ...stamp, ...args }));
  validateTool('uie.runtime.hover', { ...stamp, id: null });
  validateTool('uie.runtime.batch', { sessionId: 's', revision: 0, steps: [{ action: 'hover', id: null }, { action: 'assert', id: 'n', hovered: false }] });
});

test('real Luau mouse events, scroll defaults, cancellation and isolation', async () => {
  const { document, button, scroll, child } = mouseFixture(), original = JSON.stringify(document);
  const started = await LuauSession.start(resolve('native-bin'), document);
  let frame = started.frame;
  const logs: string[] = [];
  const mouse = new RuntimeMouse(() => frame, async command => { frame = await started.session.command(command); logs.push(...frame.logs.map(log => log.message)); }, robloxStrategy);
  const text = () => findNode(frame.document.root, button.id)!.properties.Text;
  try {
    await mouse.perform({ action: 'hover', id: button.id }); assert.equal(text(), 'hover');
    await mouse.perform({ action: 'hover', id: null }); assert.equal(text(), 'leave');
    await mouse.perform({ action: 'drag', id: button.id, from: { x: .1, y: .5 }, to: { x: .9, y: .5 }, steps: 3 });
    assert.equal(text(), 'up'); assert.equal(mouse.inspect().pressedId, null);
    assert.equal(logs.filter(log => log.startsWith('move')).length, 3);
    frame = await started.session.command({ type: 'event', node: button.id }); assert.equal(text(), 'click');
    const result = await mouse.perform({ action: 'scroll', id: scroll.id, to: { y: 5000 } });
    assert.deepEqual(findNode(frame.document.root, scroll.id)!.properties.CanvasPosition, { x: 0, y: 768 });
    assert.ok(result.dispatched); assert.ok(logs.includes('scroll\t768'));
    const count = logs.filter(log => log.startsWith('scroll')).length;
    await mouse.perform({ action: 'scroll', id: scroll.id, to: { y: 768 } });
    assert.equal(logs.filter(log => log.startsWith('scroll')).length, count);
    await mouse.perform({ action: 'scroll', id: scroll.id, to: { y: 0 } });
    await mouse.wheel(child.id, { x: 0, y: 100 });
    assert.deepEqual(findNode(frame.document.root, scroll.id)!.properties.CanvasPosition, { x: 0, y: 100 });
    assert.ok(logs.includes('wheel'));
    await mouse.pointer('down', button.id, { x: 100, y: 80 }); await mouse.cancel();
    assert.ok(logs.some(log => log.endsWith('InputEnded'))); assert.equal(mouse.inspect().pressedId, null);
    assert.ok(logs.includes('end\tCancel'));
    await mouse.pointer('down', button.id, { x: 100, y: 80 });
    frame = await started.session.command({ type: 'set', node: button.id, property: 'Visible', value: false });
    await mouse.pointer('move', button.id, { x: 110, y: 90 });
    assert.equal(mouse.inspect().pressedId, null);
    assert.equal(logs.filter(log => log === 'end\tCancel').length, 2);
    assert.deepEqual(await mouse.perform({ action: 'hover', id: button.id }), { dispatched: false, reason: 'hidden' });
    await assert.rejects(started.session.command({ type: 'mouse', node: button.id, event: 'FocusLost', x: 0, y: 0, dx: 0, dy: 0, button: 0 }), /鼠标/);
    assert.equal(JSON.stringify(document), original);
  } finally { await started.session.stop(); }
});

test('drag geometry includes ancestor rotation, scale and scroll offset', () => {
  const { document, scroll, child } = mouseFixture();
  scroll.properties.Rotation = 90;
  scroll.properties.CanvasPosition = { x: 0, y: 100 };
  const scale = robloxStrategy.createNode('UIScale'); scale.properties.Scale = 2; scroll.children.push(scale);
  const frame = { document, logs: [], disabled: [] };
  const mouse = new RuntimeMouse(() => frame, async () => {}, robloxStrategy);
  const point = mouse.point(child.id, { x: .5, y: .5 });
  // Parent origin (400,60), rotated around its scaled center (300,240).
  assert.ok(Math.abs(point.x - 1060) < 1e-8);
  assert.ok(Math.abs(point.y - 280) < 1e-8);
  const local = localMousePoint(runtimeGeometry(frame, robloxStrategy, child.id)!.matrix, point);
  assert.ok(Math.abs(local.x - 140) < 1e-8); assert.ok(Math.abs(local.y - 40) < 1e-8);
});
