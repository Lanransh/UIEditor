import { applyRuntimePatch } from '../src/shared/runtime';
import { WheelInputBuffer } from '../src/editor/wheelInput';
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

test('unobserved wheel uses one host update and none at the scroll boundary', async () => {
  const { document, scroll, child } = mouseFixture();
  document.scripts = robloxStrategy.createDocument('Mouse').scripts;
  const started = await LuauSession.start(resolve('native-bin'), document);
  let frame = started.frame, commands = 0;
  const mouse = new RuntimeMouse(() => frame, async command => { commands++; frame = await started.session.command(command); }, robloxStrategy);
  try {
    await mouse.wheel(child.id, { x: 0, y: 100 });
    assert.deepEqual(frame.patch, { [scroll.id]: { properties: { CanvasPosition: { x: 0, y: 100 } } } });
    const { document: fullDocument, ...wire } = frame;
    assert.ok(Buffer.byteLength(JSON.stringify(wire)) < 512);
    assert.equal(commands, 1, 'A wheel with no script listeners must not round-trip unused mouse events');
    assert.deepEqual(findNode(frame.document.root, scroll.id)!.properties.CanvasPosition, { x: 0, y: 100 });
    await mouse.scroll(scroll.id, { y: 99999 }); commands = 0;
    await mouse.wheel(child.id, { x: 0, y: 100 }); assert.equal(commands, 0);
    await mouse.pointer('move', child.id, { x: 450, y: 80 }); assert.equal(commands, 0);
  } finally { await started.session.stop(); }
});

test('pending wheel inputs merge without overtaking other input or losing reversals', async () => {
  const buffer = new WheelInputBuffer(), queued: (() => Promise<void>)[] = [], values: number[] = [];
  const schedule = (run: () => Promise<void>) => { buffer.seal(); queued.push(run); return Promise.resolve(); };
  const run = async (delta: { x: number; y: number }) => { values.push(delta.y); };
  for (let i = 0; i < 100; i++) buffer.push('list', { x: 0, y: 2 }, true, schedule, run);
  assert.equal(queued.length, 1);
  await queued.shift()!(); assert.deepEqual(values, [200]);
  buffer.push('list', { x: 0, y: 20 }, true, schedule, run);
  buffer.push('list', { x: 0, y: -20 }, true, schedule, run);
  assert.equal(queued.length, 2);
  for (const work of queued.splice(0)) await work();
  assert.deepEqual(values, [200, 20, -20]);
  buffer.push('list', { x: 0, y: 1 }, true, schedule, run); buffer.seal();
  buffer.push('list', { x: 0, y: 1 }, true, schedule, run);
  assert.equal(queued.length, 2); for (const work of queued.splice(0)) await work();
  for (let i = 0; i < 3; i++) buffer.push('list', { x: 0, y: 1 }, false, schedule, run);
  assert.equal(queued.length, 3); for (const work of queued.splice(0)) await work();
});

test('mouse listener discovery follows runtime connection and disconnection', async () => {
  const { document, button, scroll, child } = mouseFixture();
  document.scripts.source = `local FX = _G.FX
local UI = FX.Class("CMouseView", "CUIView")
function UI:OnReady()
    local root = FX.Loader:PlayerGui("Mouse")
    local connection
    self:TrackConnection(root.Button.Activated:Connect(function()
        if connection then connection:Disconnect() connection = nil
        else connection = self:TrackConnection(root.List.MouseWheelBackward:Connect(function() root.Button.Text = "wheel observed" end)) end
    end))
end
return UI`;
  const started = await LuauSession.start(resolve('native-bin'), document);
  let frame = started.frame, commands = 0;
  const mouse = new RuntimeMouse(() => frame, async command => { commands++; frame = await started.session.command(command); }, robloxStrategy);
  try {
    assert.equal(mouse.canMergeWheel(child.id), true);
    frame = await started.session.command({ type: 'event', node: button.id });
    assert.equal(mouse.canMergeWheel(child.id), false);
    await mouse.wheel(child.id, { x: 0, y: 10 });
    assert.equal(findNode(frame.document.root, button.id)!.properties.Text, 'wheel observed');
    assert.equal(commands, 2);
    frame = await started.session.command({ type: 'event', node: button.id });
    assert.equal(mouse.canMergeWheel(child.id), true);
    commands = 0; await mouse.wheel(child.id, { x: 0, y: 10 }); assert.equal(commands, 1);
  } finally { await started.session.stop(); }
});

test('runtime property deltas preserve untouched nodes and reject invalid references', () => {
  const { document, scroll, button } = mouseFixture();
  const changed = applyRuntimePatch(document, { [scroll.id]: { properties: { CanvasPosition: { x: 0, y: 100 } } } });
  assert.equal(findNode(changed.root, button.id), button);
  assert.deepEqual(scroll.properties.CanvasPosition, { x: 0, y: 0 });
  assert.deepEqual(findNode(changed.root, scroll.id)!.properties.CanvasPosition, { x: 0, y: 100 });
  assert.equal(applyRuntimePatch(document, {}), document);
  assert.throws(() => applyRuntimePatch(document, { missing: { name: 'x' } }), /不存在/);
  assert.throws(() => applyRuntimePatch(document, { [scroll.id]: { children: [] } }), /增量/);
  assert.throws(() => applyRuntimePatch(document, { [scroll.id]: { properties: { Unsupported: 1 } } }), /增量/);
});

test('mobile input suppresses mouse events, scrolls content and cancels before mode changes', async () => {
  const { document, button, scroll, child } = mouseFixture();
  document.scripts.source = document.scripts.source.replace('    local b = root.Button', `    local b = root.Button
    for _, event in ipairs({"InputBegan", "InputChanged", "InputEnded"}) do
        self:TrackConnection(root.List.Content[event]:Connect(function(input)
            print("touch", event, input.UserInputType.Name, input.UserInputState.Name)
        end))
    end`);
  const saved = JSON.stringify(document);
  const started = await LuauSession.start(resolve('native-bin'), document);
  let frame = started.frame;
  const logs: string[] = [];
  const mouse = new RuntimeMouse(() => frame, async command => { frame = await started.session.command(command); logs.push(...frame.logs.map(log => log.message)); }, robloxStrategy);
  const position = () => findNode(frame.document.root, scroll.id)!.properties.CanvasPosition;
  try {
    const from = mouse.point(child.id), to = { x: from.x, y: from.y-80 };
    await mouse.pointer('down', child.id, from); await mouse.pointer('move', child.id, to); await mouse.pointer('up', child.id, to);
    assert.deepEqual(position(), { x: 0, y: 0 }, 'PC content drag must not scroll');
    await mouse.hover(button.id);
    await mouse.setMode('mobile');
    assert.equal(mouse.inspect().hoveredId, null);
    const beforeHover = logs.length;
    await mouse.hover(button.id); await mouse.pointer('move', button.id, mouse.point(button.id));
    assert.equal(logs.length, beforeHover, 'Mobile idle movement must not produce hover or input events');
    await mouse.wheel(child.id, { x: 0, y: 100 });
    assert.deepEqual(position(), { x: 0, y: 0 });
    await mouse.pointer('down', child.id, from);
    await mouse.pointer('move', child.id, to);
    assert.deepEqual(position(), { x: 0, y: 80 });
    assert.ok(logs.includes('touch	InputBegan	Touch	Begin'));
    assert.ok(logs.includes('touch	InputChanged	Touch	Change'));
    assert.ok(!logs.includes('wheel'), 'Touch scrolling must not notify wheel listeners');
    await mouse.setMode('pc');
    assert.ok(logs.includes('touch	InputEnded	Touch	Cancel'));
    assert.equal(mouse.inspect().pressedId, null);
    await mouse.wheel(child.id, { x: 0, y: 20 });
    assert.deepEqual(position(), { x: 0, y: 100 });
    await mouse.setMode('mobile');
    await mouse.perform({ action: 'drag', id: child.id, from: { x: .5, y: .5 }, to: { x: .5, y: 0 } });
    assert.deepEqual(position(), { x: 0, y: 140 });
    assert.ok(logs.includes('touch	InputEnded	Touch	End'));
    frame = await started.session.command({ type: 'set', node: scroll.id, property: 'ScrollingDirection', value: 'X' });
    await mouse.perform({ action: 'drag', id: child.id, from: { x: .5, y: .5 }, to: { x: .5, y: 0 } });
    assert.deepEqual(position(), { x: 0, y: 0 }, 'Touch drag respects the supported scroll axis');
    assert.equal(JSON.stringify(document), saved);
    await assert.rejects(started.session.command({ type: 'mouse', node: button.id, event: 'MouseMoved', x: 0, y: 0, dx: 0, dy: 0, button: 0, touch: true }), /鼠标/);
  } finally { await started.session.stop(); }
});
