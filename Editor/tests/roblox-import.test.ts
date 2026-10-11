import { uiEditorCompSource } from '../src/shared/uiCompClass';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { robloxStrategy as strategy } from '../src/editor/roblox';
import { createRobloxImportPackage, findUnconfiguredRobloxImages } from '../src/shared/robloxImport';

test('import preserves node paths, scripts, scale/offset and gradient sequences without changing the document', () => {
  const document = strategy.createDocument('Rewards'); document.root.name = 'RewardsUI';
  const button = strategy.createNode('TextButton'); button.name = 'ClaimBtn';
  button.properties.Position = { x: { scale: .5, offset: -50 }, y: { scale: 0, offset: 20 } };
  button.children.push(strategy.createNode('UIGradient')); document.root.children.push(button);
  const before = JSON.stringify(document); const result = createRobloxImportPackage(document);
  assert.equal(JSON.stringify(document), before); assert.equal(result.scripts.shared, uiEditorCompSource);
  assert.ok(result.scripts.source.includes(document.scripts.source));
  assert.match(result.scripts.source, /UI.ScreenGuiName = "RewardsUI"/);
  assert.match(result.scripts.source, /require\(script.Parent.CUIView\)/);
  assert.equal(document.scripts.integration, JSON.parse(before).scripts.integration);
  assert.deepEqual(result.model.children[0].properties.Position, { UDim2: [[.5, -50], [0, 20]] });
  assert.equal(result.model.children[0].name, 'ClaimBtn');
  assert.deepEqual(result.model.children[0].attributes.UIEditorNodeId, { String: button.id });
  assert.equal(result.model.properties.IgnoreGuiInset, true);
  assert.equal(result.model.children[0].properties.BorderSizePixel, 0);
  const properties = result.model.children[0].children[0].properties;
  assert.ok(properties.Color); assert.ok(properties.Transparency); assert.equal(properties.ColorStart, undefined);
});
test('import disables the root without changing editor visibility or descendant properties', () => {
  const document = strategy.createDocument('Rewards');
  const frame = strategy.createNode('Frame');
  const stroke = strategy.createNode('UIStroke');
  frame.children.push(stroke); document.root.children.push(frame);
  for (const enabled of [true, false]) {
    document.root.properties.Enabled = enabled;
    const before = JSON.stringify(document);
    const result = createRobloxImportPackage(document);
    assert.equal(result.model.properties.Enabled, false);
    assert.equal(result.model.children[0].properties.Visible, true);
    assert.equal(result.model.children[0].children[0].properties.Enabled, true);
    assert.equal(JSON.stringify(document), before);
  }
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

test('image preflight groups repeated asset and inline previews and reports node paths', () => {
  const document = strategy.createDocument('Rewards'); document.root.name = 'RewardsUI';
  const previewImage = { name: 'training.png', dataUrl: 'data:image/png;base64,AAAA' };
  const first = strategy.createNode('ImageLabel'); first.name = 'TrainingIcon'; first.imageAssetId = 'training'; first.previewImage = previewImage;
  const repeated = strategy.createNode('ImageButton'); repeated.name = 'TrainingButton'; repeated.imageAssetId = 'training'; repeated.previewImage = previewImage;
  const inline = strategy.createNode('ImageLabel'); inline.name = 'InlineIcon'; inline.previewImage = previewImage;
  document.root.children.push(first, repeated, inline);
  const assets = [{ id: 'training', platform: 'roblox' as const, library: 'project' as const, name: 'TrainingIcon', tags: '', previewImage, robloxId: '', usage: 'image' as const }];
  const missing = findUnconfiguredRobloxImages(document, assets);
  assert.equal(missing.length, 2);
  assert.deepEqual(missing[0].nodePaths, ['RewardsUI.TrainingIcon', 'RewardsUI.TrainingButton']);
  assert.equal(missing[0].assetId, 'training');
  assert.deepEqual(missing[1].nodePaths, ['RewardsUI.InlineIcon']);
  assert.equal(missing[1].assetId, undefined);
  first.properties.Image = 'rbxassetid://123';
  assert.equal(findUnconfiguredRobloxImages(document, assets)[0].nodePaths.length, 1);
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
  document.scripts.source = document.scripts.source.replace('"CUIView"', '"FCUICompClass"');
  const saved = document.scripts.source;
  const result = createRobloxImportPackage(document);
  assert.match(result.scripts.source, /FX.Class\("CLegacyView", "CUIView"\)/);
  assert.equal(document.scripts.source, saved);
});
