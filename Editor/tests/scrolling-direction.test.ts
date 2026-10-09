import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { robloxStrategy as strategy } from '../src/editor/roblox';
import { scrollGeometry } from '../src/editor/appearance';
import { createRobloxImportPackage } from '../src/shared/robloxImport';
import { executeCode, robloxCodeAdapter } from '../electron/code-executor';
import { LuauSession } from '../electron/runtime';
import { RuntimeMouse } from '../src/editor/runtimeMouse';
import { dim2, findNode } from '../src/shared/uiDocument';
import { mouseFixture } from './runtime-mouse-fixture';

test('scrolling direction survives JSON and import; older documents default to XY', () => {
  const document = strategy.createDocument('Scroll');
  const scroll = strategy.createNode('ScrollingFrame'); document.root.children.push(scroll);
  assert.equal(scroll.properties.ScrollingDirection, 'XY');
  delete scroll.properties.ScrollingDirection;
  const before = JSON.stringify(document);
  assert.equal(strategy.validate(document).root.children[0].properties.ScrollingDirection, 'XY');
  assert.equal(JSON.stringify(document), before);
  for (const direction of ['X', 'Y', 'XY']) {
    scroll.properties.ScrollingDirection = direction;
    assert.deepEqual(strategy.validate(JSON.parse(JSON.stringify(document))), document);
    assert.equal(createRobloxImportPackage(document).model.children[0].properties.ScrollingDirection, direction);
  }
  for (const invalid of ['Z', '', 2, null]) {
    Object.assign(scroll.properties, { ScrollingDirection: invalid });
    assert.throws(() => strategy.validate(document), /ScrollingDirection/);
  }
});

test('single axis suppresses its opposite scrollbar, offset and cross-axis overflow', () => {
  const y = scrollGeometry(200, 100, 200, 400, 8, 80, 10000, 'Y');
  assert.equal(y.horizontal, false); assert.equal(y.vertical, true);
  assert.equal(y.maxX, 0); assert.equal(y.x, 0); assert.equal(y.y, 300);
  assert.equal(y.windowHeight, 100); assert.equal(y.windowWidth, 192);
  const x = scrollGeometry(200, 100, 400, 100, 8, 10000, 80, 'X');
  assert.equal(x.horizontal, true); assert.equal(x.vertical, false);
  assert.equal(x.maxY, 0); assert.equal(x.y, 0); assert.equal(x.x, 200);
  assert.equal(x.windowWidth, 200); assert.equal(x.windowHeight, 92);
  const hidden = scrollGeometry(200, 100, 400, 400, 0, 80, 60, 'Y');
  assert.equal(hidden.maxX, 0); assert.equal(hidden.y, 60);
});

test('authoring accepts ScrollingDirection enum and rejects unsupported values', async () => {
  const document = strategy.createDocument('Scroll');
  const result = await executeCode(robloxCodeAdapter, resolve('native-bin'), document, 'luau', `
local list = ui.nodes.create("ScrollingFrame", {properties={ScrollingDirection=Enum.ScrollingDirection.Y}})
ui.nodes.setProperties(list.id, {ScrollingDirection=Enum.ScrollingDirection.X})
`);
  assert.equal(result.document.root.children[0].properties.ScrollingDirection, 'X');
  await assert.rejects(executeCode(robloxCodeAdapter, resolve('native-bin'), document, 'luau',
    'ui.nodes.create("ScrollingFrame", {properties={ScrollingDirection="Z"}})'));
  assert.equal(document.root.children.length, 0);
});

test('runtime script direction changes constrain tool scrolling and wheel input', async () => {
  const { document, scroll, button, child } = mouseFixture();
  scroll.properties.CanvasSize = dim2(500, 1000);
  document.scripts.source = `local FX = _G.FX
local UI = FX.Class("CMouseView", "CUIView")
function UI:OnReady()
    local root = FX.Loader:PlayerGui("Mouse")
    root.List.ScrollingDirection = Enum.ScrollingDirection.Y
    self:TrackConnection(root.Button.Activated:Connect(function()
        root.List.ScrollingDirection = Enum.ScrollingDirection.X
    end))
end
return UI`;
  const started = await LuauSession.start(resolve('native-bin'), document);
  let frame = started.frame;
  const mouse = new RuntimeMouse(() => frame, async command => { frame = await started.session.command(command); }, strategy);
  try {
    const y = await mouse.scroll(scroll.id, { x: 5000, y: 5000 });
    assert.deepEqual(y.range, { x: 0, y: 760 });
    assert.deepEqual(y.position, { x: 0, y: 760 });
    await mouse.scroll(scroll.id, { y: 0 });
    await mouse.wheel(child.id, { x: 100, y: 100 });
    assert.deepEqual(findNode(frame.document.root, scroll.id)!.properties.CanvasPosition, { x: 0, y: 100 });
    frame = await started.session.command({ type: 'event', node: button.id });
    assert.deepEqual(mouse.point(child.id, { x: 0, y: 0 }), { x: 400, y: 60 });
    const x = await mouse.scroll(scroll.id, { x: 5000, y: 5000 });
    assert.deepEqual(x.range, { x: 200, y: 0 });
    assert.deepEqual(x.position, { x: 200, y: 0 });
    assert.deepEqual(mouse.point(child.id, { x: 0, y: 0 }), { x: 200, y: 60 });
    assert.equal(scroll.properties.ScrollingDirection, 'XY');
  } finally { await started.session.stop(); }
});
