import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { robloxStrategy as strategy } from '../src/editor/roblox';
import { createRobloxImportPackage } from '../src/shared/robloxImport';
import { getCapabilities } from '../src/editor/automationCapabilities';
import { executeCode, robloxCodeAdapter } from '../electron/code-executor';
import { LuauSession } from '../electron/runtime';

const textClasses = ['TextLabel', 'TextButton', 'TextBox'];

test('runtime OnReady can disable localization on the root and visual descendants', async () => {
  const document = strategy.createDocument('Localization');
  const classes = ['Frame', 'ScrollingFrame', 'CanvasGroup', 'ImageLabel', 'ImageButton', ...textClasses];
  for (const className of classes) document.root.children.push(strategy.createNode(className));
  document.scripts.source = `local UI = _G.FX.Class("CLocalizationView", "CUIView")
function UI:OnReady()
    local root = self:GetRootNode()
    assert(typeof(root) == "Instance")
    root.AutoLocalize = false
    for _, node in ipairs(root:GetChildren()) do
        node.AutoLocalize = false
    end
end
return UI`;
  const original = JSON.stringify(document);
  const { session, frame } = await LuauSession.start(resolve('native-bin'), document);
  try {
    assert.equal(frame.document.root.properties.AutoLocalize, false);
    for (const node of frame.document.root.children) assert.equal(node.properties.AutoLocalize, false);
    assert.equal(JSON.stringify(document), original);
    const imported = createRobloxImportPackage(frame.document);
    assert.equal(imported.model.properties.AutoLocalize, false);
    for (const node of imported.model.children) assert.equal(node.properties.AutoLocalize, false);
  } finally { await session.stop(); }
  for (const node of [document.root, ...document.root.children]) delete node.properties.AutoLocalize;
  const legacy = strategy.validate(document);
  for (const node of [legacy.root, ...legacy.root.children]) assert.equal(node.properties.AutoLocalize, true);
});

test('text localization defaults and legacy migration preserve explicit opt-out on save and import', () => {
  const document = strategy.createDocument('Localization');
  for (const className of textClasses) {
    const node = strategy.createNode(className);
    assert.equal(node.properties.AutoLocalize, true);
    const legacy = strategy.createNode(className); legacy.name = `${className}Legacy`;
    delete legacy.properties.AutoLocalize;
    node.properties.AutoLocalize = false;
    document.root.children.push(node, legacy);
  }
  const saved = JSON.stringify(document);
  const loaded = strategy.validate(JSON.parse(saved));
  assert.equal(JSON.stringify(document), saved);
  assert.equal(loaded.version, 3);
  const roundTrip = strategy.validate(JSON.parse(JSON.stringify(loaded)));
  assert.deepEqual(roundTrip, loaded);
  const imported = createRobloxImportPackage(roundTrip);
  for (let i = 0; i < textClasses.length; i++) {
    assert.equal(roundTrip.root.children[i * 2].properties.AutoLocalize, false);
    assert.equal(roundTrip.root.children[i * 2 + 1].properties.AutoLocalize, true);
    assert.equal(imported.model.children[i * 2].properties.AutoLocalize, false);
    assert.equal(imported.model.children[i * 2 + 1].properties.AutoLocalize, true);
  }
  for (const className of textClasses) {
    const node = roundTrip.root.children.find(node => node.className === className)!;
    node.properties.AutoLocalize = 'false';
    assert.throws(() => strategy.validate(roundTrip), /AutoLocalize/);
    node.properties.AutoLocalize = false;
  }
});

test('MCP authoring discovers localization, defaults to enabled and can opt out on create or update', async () => {
  const before = strategy.createDocument('Localization');
  for (const className of textClasses) {
    const capabilities = getCapabilities(strategy, { className });
    assert.ok('nodes' in capabilities);
    assert.deepEqual(capabilities.nodes[className].properties.AutoLocalize, { kind: 'boolean', value: true });
  }
  const result = await executeCode(robloxCodeAdapter, resolve('native-bin'), before, 'luau', `
for _, className in ipairs({"TextLabel", "TextButton", "TextBox"}) do
    local node = ui.nodes.create(className, {name=className})
    assert(ui.nodes.get(node.id).properties.AutoLocalize == true)
    ui.nodes.setProperties(node.id, {AutoLocalize=false})
    ui.nodes.create(className, {name=className .. "Custom", properties={AutoLocalize=false}})
end
`);
  for (const node of result.document.root.children) assert.equal(node.properties.AutoLocalize, false);
  for (const node of createRobloxImportPackage(result.document).model.children) assert.equal(node.properties.AutoLocalize, false);
  assert.equal(before.root.children.length, 0);
  await assert.rejects(executeCode(robloxCodeAdapter, resolve('native-bin'), before, 'luau',
    'ui.nodes.create("TextLabel", {properties={AutoLocalize="false"}})'));
});
