import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { robloxStrategy as strategy } from '../src/editor/roblox';
import { createRobloxImportPackage } from '../src/shared/robloxImport';
import { LuauSession } from '../electron/runtime';

test('Roblox symbols survive JSON round trips and native import as Unicode text', () => {
  const document = strategy.createDocument('Symbols');
  for (const className of ['TextLabel', 'TextButton', 'TextBox']) {
    const node = strategy.createNode(className);
    node.properties.Text = '\uE002 100 金币 \uE002';
    if (className === 'TextBox') node.properties.PlaceholderText = '\uE002 价格';
    document.root.children.push(node);
  }
  const loaded = strategy.validate(JSON.parse(JSON.stringify(document)));
  assert.deepEqual(loaded, document);
  const imported = createRobloxImportPackage(loaded);
  for (const node of imported.model.children) assert.equal(node.properties.Text, '\uE002 100 金币 \uE002');
  assert.equal(imported.model.children[2].properties.PlaceholderText, '\uE002 价格');
});

test('runtime utf8.char Robux changes only the preview and remains native on export', async () => {
  const document = strategy.createDocument('Symbols');
  const label = strategy.createNode('TextLabel'); label.name = 'Price';
  document.root.children.push(label);
  document.scripts.source = `local UI = _G.FX.Class("CSymbolsView", "CUIView")
function UI:OnReady()
    self:GetRootNode():GetChildren()[1].Text = utf8.char(0xE002) .. " 100"
end
return UI`;
  const before = JSON.stringify(document);
  const { session, frame } = await LuauSession.start(resolve('native-bin'), document);
  try {
    assert.equal(frame.document.root.children[0].properties.Text, '\uE002 100');
    assert.equal(createRobloxImportPackage(frame.document).model.children[0].properties.Text, '\uE002 100');
    assert.equal(JSON.stringify(document), before);
  } finally { await session.stop(); }
});
