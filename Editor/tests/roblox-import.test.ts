import { uiEditorCompSource } from '../src/shared/uiCompClass';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { robloxStrategy as strategy } from '../src/editor/roblox';
import { createRobloxImportPackage } from '../src/shared/robloxImport';

test('import preserves node paths, scripts, scale/offset and gradient sequences without changing the document', () => {
  const document = strategy.createDocument('Rewards'); document.root.name = 'RewardsUI';
  const button = strategy.createNode('TextButton'); button.name = 'ClaimBtn';
  button.properties.Position = { x: { scale: .5, offset: -50 }, y: { scale: 0, offset: 20 } };
  button.children.push(strategy.createNode('UIGradient')); document.root.children.push(button);
  const before = JSON.stringify(document); const result = createRobloxImportPackage(document);
  assert.equal(JSON.stringify(document), before); assert.equal(result.scripts.shared, uiEditorCompSource);
  assert.ok(result.scripts.source.includes(document.scripts.source));
  assert.match(result.scripts.source, /UI.ScreenGuiName = "RewardsUI"/);
  assert.match(result.scripts.source, /require\(script.Parent.CUIEditorUICompClass\)/);
  assert.equal(document.scripts.integration, JSON.parse(before).scripts.integration);
  assert.deepEqual(result.model.children[0].properties.Position, { UDim2: [[.5, -50], [0, 20]] });
  assert.equal(result.model.children[0].name, 'ClaimBtn');
  assert.deepEqual(result.model.children[0].attributes.UIEditorNodeId, { String: button.id });
  assert.equal(result.model.properties.IgnoreGuiInset, true);
  assert.equal(result.model.children[0].properties.BorderSizePixel, 0);
  const properties = result.model.children[0].children[0].properties;
  assert.ok(properties.Color); assert.ok(properties.Transparency); assert.equal(properties.ColorStart, undefined);
});
test('import rejects ambiguous paths, local-only pictures and fractional offsets', () => {
  const document = strategy.createDocument(); document.root.name = 'RewardsUI';
  const first = strategy.createNode('Frame'); const second = strategy.createNode('Frame'); document.root.children.push(first, second);
  assert.throws(() => createRobloxImportPackage(document), /同名/);
  second.name = 'Other'; first.name = 'Invalid.Path'; assert.throws(() => createRobloxImportPackage(document), /节点名/);
  first.name = 'Panel'; first.properties.Position = { x: { scale: 0, offset: .5 }, y: { scale: 0, offset: 0 } };
  assert.throws(() => createRobloxImportPackage(document), /Offset/);
  document.root.children = [strategy.createNode('ImageLabel')];
  document.root.children[0].previewImage = { name: 'tile.png', dataUrl: 'data:image/png;base64,AAAA' };
  assert.throws(() => createRobloxImportPackage(document), /本地预览/);
  document.root.children[0].properties.Image = 'rbxassetid://123';
  assert.equal(JSON.stringify(createRobloxImportPackage(document)).includes('data:image'), false);
});

test('import enables automatic localization on root and visual descendants only', () => {
  const document = strategy.createDocument('LocalizedUI');
  const frame = strategy.createNode('Frame');
  for (const className of ['TextLabel', 'TextButton', 'TextBox', 'ImageLabel', 'ImageButton', 'ScrollingFrame', 'CanvasGroup']) {
    const child = strategy.createNode(className); child.name = className; frame.children.push(child);
  }
  frame.children[0].children.push(strategy.createNode('UITextSizeConstraint'));
  document.root.children.push(frame);
  const result = createRobloxImportPackage(document);
  assert.equal(result.model.properties.AutoLocalize, true);
  assert.equal(result.model.children[0].properties.AutoLocalize, true);
  for (const child of result.model.children[0].children) assert.equal(child.properties.AutoLocalize, true);
  assert.equal(result.model.children[0].children[0].children[0].properties.AutoLocalize, undefined);
  assert.equal(document.root.properties.AutoLocalize, undefined);
});

test('legacy inheritance migrates only in generated source, without changing saved scripts', () => {
  const document = strategy.createDocument('Legacy');
  document.scripts.source = document.scripts.source.replace('"CUIEditorUICompClass"', '"FCUICompClass"');
  const saved = document.scripts.source;
  const result = createRobloxImportPackage(document);
  assert.match(result.scripts.source, /FX.Class\("CLegacyUIBaseCompClass", "CUIEditorUICompClass"\)/);
  assert.equal(document.scripts.source, saved);
});
