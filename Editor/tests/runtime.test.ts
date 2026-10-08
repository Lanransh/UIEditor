import { readFile } from 'node:fs/promises';
import { uiEditorCompSource } from '../src/shared/uiCompClass';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { LuauSession, RuntimeError } from '../electron/runtime';
import { robloxStrategy } from '../src/editor/roblox';
import { rewardExample } from '../src/editor/scriptExample';
import { findNode } from '../src/shared/uiDocument';
import { CommandHistory } from '../src/history/CommandHistory';
import { documentCommand } from '../src/editor/commands';

const directory = resolve('native-bin');
const sourceClass = (body: string) => `local FX = _G.FX
local UI = FX.Class("COnlineRewardUIBaseCompClass", "FCUICompClass")
${body}
return UI`;
const previewClass = (body: string) => `local FX = _G.FX
local Preview = FX.Class("COnlineRewardUIPreviewCompClass", "COnlineRewardUIBaseCompClass")
${body}
return Preview`;
async function start(body: string) {
  const document = rewardExample();
  document.scripts.source = sourceClass(body);
  return LuauSession.start(directory, document);
}
const buttonId = (document: ReturnType<typeof rewardExample>) => document.root.children[2].id;

test('two class scripts round-trip and malformed documents are rejected', () => {
  const example = rewardExample();
  assert.deepEqual(robloxStrategy.validate(JSON.parse(JSON.stringify(example))), example);
  assert.deepEqual(Object.keys(example.scripts).sort(), ['integration', 'source']);
  assert.throws(() => robloxStrategy.validate({ ...example, version: 1 }), /版本/);
  for (const integration of [123, 'x'.repeat(262145)]) {
    assert.throws(() => robloxStrategy.validate({ ...example, scripts: { ...example.scripts, integration } }), /脚本/);
  }
});

test('preview owns configuration and mutable state; inherited interaction dispatches a claim', async () => {
  const document = rewardExample(), original = JSON.stringify(document);
  const { session, frame } = await LuauSession.start(directory, document);
  const button = buttonId(document);
  try {
    assert.equal(findNode(frame.document.root, button)?.properties.Text, 'Ready');
    assert.equal(frame.document.root.children[0].properties.Text, '5-minute reward · 500');
    const claimed = await session.command({ type: 'event', node: button });
    assert.equal(findNode(claimed.document.root, button)?.properties.Text, 'Claimed');
    assert.deepEqual(claimed.logs.map(log => log.kind), ['action', 'output']);
    assert.match(claimed.logs[0].message, /ClaimReward.*online_5min/);
    assert.deepEqual(claimed.disabled, [button]);
    assert.equal((await session.command({ type: 'event', node: button })).logs.length, 0);
    assert.equal(JSON.stringify(document), original);
  } finally { await session.stop(); }
  await assert.rejects(session.command({ type: 'event', node: button }), /结束/);
});

test('external show and hide invoke lifecycle hooks without recreating state or connections', async () => {
  const document = rewardExample();
  document.scripts.source = document.scripts.source.replace('return UI', `function UI:OnShow() print("shown", self:GetUIState().Status) end
function UI:OnHide() print("hidden", self:GetUIState().Status) end
return UI`);
  const original = JSON.stringify(document);
  const { session, frame } = await LuauSession.start(directory, document);
  const button = buttonId(document);
  try {
    assert.equal(frame.document.root.properties.Enabled, true);
    assert.match(frame.logs.at(-1)!.message, /shown.*Claimable/);
    const hidden = await session.command({ type: 'hide' });
    assert.equal(hidden.document.root.properties.Enabled, false);
    assert.match(hidden.logs[0].message, /hidden.*Claimable/);
    assert.equal((await session.command({ type: 'event', node: button })).logs.length, 0);
    const shown = await session.command({ type: 'show' });
    assert.equal(shown.document.root.properties.Enabled, true);
    assert.match(shown.logs[0].message, /shown.*Claimable/);
    const claimed = await session.command({ type: 'event', node: button });
    assert.equal(claimed.logs.filter(log => log.kind === 'action').length, 1);
    await session.command({ type: 'hide' });
    const reopened = await session.command({ type: 'show' });
    assert.match(reopened.logs[0].message, /shown.*Claimed/);
    assert.equal(findNode(reopened.document.root, button)?.properties.Text, 'Claimed');
    assert.equal((await session.command({ type: 'event', node: button })).logs.length, 0);
    assert.equal(JSON.stringify(document), original);
  } finally { await session.stop(); }
});

test('locked and claimed states come from the integration constructor', async () => {
  for (const status of ['Locked', 'Claimed']) {
    const document = rewardExample();
    document.scripts.integration = document.scripts.integration.replace('Status = "Claimable", RemainingSeconds = 0', `Status = "${status}", RemainingSeconds = 120`);
    const { session, frame } = await LuauSession.start(directory, document);
    try {
      assert.equal(findNode(frame.document.root, buttonId(document))?.properties.Text, status === 'Locked' ? '120 seconds remaining' : 'Claimed');
      assert.deepEqual(frame.disabled, [buttonId(document)]);
    } finally { await session.stop(); }
  }
});

test('FX inheritance supports constructors, super calls, custom methods and destruction', async () => {
  const document = rewardExample();
  document.scripts.source = sourceClass(`function UI:Ctor(owner)
 UI.Super.Ctor(self, owner)
 self.count = 1
end
function UI:Add(value) self.count += value end
function UI:OnReady()
 assert(self:IsA("FCUICompClass") and self:IsA("COnlineRewardUIBaseCompClass"))
 assert(self:GetClassName() == "COnlineRewardUIPreviewCompClass")
 assert(FX.Loader:PlayerGui(self:GetRootNode().Name) == self:GetRootNode())
 self:Add(2)
 print("ready", self.count)
end
function UI:Dtor()
 print("disposed")
 UI.Super.Dtor(self)
end`);
  document.scripts.integration = previewClass(`function Preview:Ctor(owner)
 Preview.Super.Ctor(self, owner)
 self:Add(4)
end
function Preview:OnReady()
 Preview.Super.OnReady(self)
 self:Add(8)
 print("preview", self.count)
end`);
  const { session, frame } = await LuauSession.start(directory, document);
  assert.deepEqual(frame.logs.map(log => log.message), ['ready\t7', 'preview\t15']);
  const stopped = await session.command({ type: 'stop' });
  assert.equal(stopped.logs[0].message, 'disposed');
  session.abort();
});

test('PlayerGui and Here resolve dot paths and reject slash or malformed paths', async () => {
  const document = rewardExample();
  const panel = robloxStrategy.createNode('Frame');
  panel.name = 'Panel';
  const button = document.root.children.pop()!;
  panel.children.push(button);
  document.root.children.push(panel);
  document.scripts.source = document.scripts.source.replace('"ClaimButton"', '"Panel.ClaimButton"');
  for (const lookup of ['FXLoader:Here(root, "Panel.ClaimButton")', 'FXLoader:PlayerGui("OnlineRewardUI.Panel.ClaimButton")']) {
    const variant = structuredClone(document);
    variant.scripts.source = variant.scripts.source.replace('FXLoader:Here(root, "Panel.ClaimButton")', lookup);
    const { session, frame } = await LuauSession.start(directory, variant);
    try {
      const claimed = await session.command({ type: 'event', node: button.id });
      assert.equal(findNode(claimed.document.root, button.id)?.properties.Text, 'Claimed');
      assert.equal(findNode(frame.document.root, button.id)?.properties.Text, 'Ready');
    } finally { await session.stop(); }
  }
  for (const path of ['Panel/ClaimButton', '', '.Panel', 'Panel.', 'Panel..ClaimButton']) {
    const variant = structuredClone(document);
    variant.scripts.source = variant.scripts.source.replace('"Panel.ClaimButton"', JSON.stringify(path));
    await assert.rejects(LuauSession.start(directory, variant), /not supported|non-empty|Invalid UI node path/);
  }
  for (const path of ['OnlineRewardUI/Panel/ClaimButton', 'OtherUI.Panel', 'OnlineRewardUI.Panel.Missing']) {
    const variant = structuredClone(document);
    variant.scripts.source = variant.scripts.source.replace('FXLoader:Here(root, "Panel.ClaimButton")', `FXLoader:PlayerGui(${JSON.stringify(path)})`);
    await assert.rejects(LuauSession.start(directory, variant), /not supported|Missing ScreenGui|Missing UI node/);
  }
  document.scripts.source = document.scripts.source.replace('Panel.ClaimButton', 'Panel.Missing');
  await assert.rejects(LuauSession.start(directory, document), /Missing UI node: Panel.Missing/);
});

test('node paths, missing nodes and duplicate sibling names give explicit feedback', async () => {
  const document = rewardExample();
  document.root.children[2].name = 'Changed';
  await assert.rejects(LuauSession.start(directory, document), /Missing UI node: ClaimButton/);
  document.root.children[2].name = 'ClaimButton';
  const duplicate = robloxStrategy.createNode('TextButton');
  duplicate.name = 'ClaimButton';
  document.root.children.push(duplicate);
  await assert.rejects(LuauSession.start(directory, document), /Ambiguous child name/);
});

test('scripts must return classes with the correct inheritance', async () => {
  const document = rewardExample();
  document.scripts.source = 'return {}';
  await assert.rejects(LuauSession.start(directory, document), /Interaction script must return/);
  document.scripts.source = sourceClass('');
  document.scripts.integration = 'return _G.FX.Class("Wrong", "FCUICompClass")';
  await assert.rejects(LuauSession.start(directory, document), /Integration script must return/);
});

test('compile and runtime errors retain original interface and integration line numbers and logs', async () => {
  const document = rewardExample();
  document.scripts.source = 'function broken(';
  await assert.rejects(LuauSession.start(directory, document), /interface:1|interface:2/);
  document.scripts.source = 'print("before-error")\nwarn("before-warning")\nerror("after-print")';
  await assert.rejects(LuauSession.start(directory, document), error => {
    assert.ok(error instanceof RuntimeError);
    assert.match(error.message, /interface:3.*after-print/);
    assert.deepEqual(error.logs, [{ kind: 'output', message: 'before-error' }, { kind: 'warning', message: 'before-warning' }]);
    return true;
  });
  document.scripts.source = sourceClass('');
  document.scripts.integration = 'local FX = _G.FX\nerror("integration-error")';
  await assert.rejects(LuauSession.start(directory, document), /integration:2.*integration-error/);
});

test('callback updates are atomic and failed sessions terminate', async () => {
  const { session, frame } = await start(`function UI:OnReady()
 local button = self:GetRootNode().ClaimButton
 button.Activated:Connect(function()
  button.Text = "partial"
  button.TextSize = -3
 end)
end`);
  const before = JSON.stringify(frame.document), button = buttonId(frame.document);
  await assert.rejects(session.command({ type: 'event', node: button }), /属性/);
  assert.equal(JSON.stringify(frame.document), before);
  await assert.rejects(session.command({ type: 'event', node: button }), /结束/);
});

test('connections disconnect and reset sessions never share local state', async () => {
  for (let index = 0; index < 2; index++) {
    const { session, frame } = await start(`function UI:OnReady()
 self.count = 0
 local button = self:GetRootNode():WaitForChild("ClaimButton")
 local connection = self:TrackConnection(button.Activated:Connect(function() error("disconnected") end))
 connection:Disconnect()
 self:TrackConnection(button.Activated:Connect(function()
  self.count += 1
  print("count", self.count)
 end))
end`);
    try {
      const result = await session.command({ type: 'event', node: buttonId(frame.document) });
      assert.equal(result.logs[0].message, 'count\t1');
    } finally { await session.stop(); }
  }
});

test('infinite loops and allocations terminate without hanging the parent', async () => {
  await assert.rejects(start('while true do end'), /250 ms|超时|退出/);
  await assert.rejects(start('local bytes = buffer.create(100 * 1024 * 1024)'), /memory|内存|退出/);
});

test('host system access is absent and framework globals remain readonly', async () => {
  const { session } = await start(`assert(_G.FX and game == nil and require == nil and io == nil and loadstring == nil)
function UI:Render() self:EmitUIAction("data", { nested = { value = true }, nullable = JSONNull }) end`);
  await session.stop();
  await assert.rejects(start('_G.FX.Loader = {}'), /readonly/);
});

test('static documents run with default class templates', async () => {
  const document = robloxStrategy.createDocument('OnlineReward');
  const { session, frame } = await LuauSession.start(directory, document);
  try { assert.deepEqual(frame.document, document); } finally { await session.stop(); }
});

test('Roblox value types work in integration data and direct node properties', async () => {
  const document = rewardExample();
  document.scripts.integration = previewClass(`function Preview:Ctor(owner)
 Preview.Super.Ctor(self, owner)
 self.Config = { Size = UDim2.fromOffset(300, 80), Color = Color3.fromRGB(66, 184, 131), Font = Enum.Font.Gotham }
end`);
  document.scripts.source = sourceClass(`function UI:Render()
 local config, button = self:GetUIConfig(), self:GetRootNode().ClaimButton
 assert(typeof(config.Size) == "UDim2" and config.Size.X.Offset == 300)
 button.Size = config.Size
 button.AnchorPoint = Vector2.new(0.5, 0.5)
 button.BackgroundColor3 = config.Color
 button.Font = config.Font
 assert(typeof(button) == "Instance" and typeof(button.Size) == "UDim2")
 assert(button.Font == Enum.Font.Gotham)
 assert(button.BackgroundColor3.G == 184 / 255)
 assert(UDim2.new(UDim.new(0.5, 10), UDim.new(1, 20)).Width.Scale == 0.5)
end`);
  const { session, frame } = await LuauSession.start(directory, document);
  try {
    const button = findNode(frame.document.root, buttonId(document))!;
    assert.deepEqual(button.properties.Size, { x: { scale: 0, offset: 300 }, y: { scale: 0, offset: 80 } });
    assert.equal(button.properties.BackgroundColor3, '#42b883');
    assert.equal(button.properties.Font, 'Gotham');
  } finally { await session.stop(); }
  await assert.rejects(start('function UI:Render() self:GetRootNode().ClaimButton.Text = Vector2.new() end'), /Wrong Roblox value type/);
  await assert.rejects(start('function UI:Render() self:GetRootNode().ClaimButton.Font = Enum.TextXAlignment.Center end'), /Wrong enum type/);
  await assert.rejects(start('local size = UDim2.new() size.X.Offset = 2'), /readonly/);
});

test('version 2 config, state and references migrate into two class scripts and still run', async () => {
  const document = rewardExample();
  const loaded = robloxStrategy.validate({ ...document, version: 2, scripts: {
    config: 'return { title = "legacy" }',
    state: { text: 'state\u0001', literal: '\\u0001' },
    references: { Button: buttonId(document) },
    source: 'function UI:OnMount() self.UI:Set("Button", "Text", self:GetUIConfig().title .. self:GetUIState().text .. self:GetUIState().literal) end',
    integration: 'function Preview:OnUIAction() end',
  } });
  assert.equal(loaded.version, 3);
  assert.deepEqual(Object.keys(loaded.scripts).sort(), ['integration', 'source']);
  const { session, frame } = await LuauSession.start(directory, loaded);
  try { assert.equal(findNode(frame.document.root, buttonId(document))?.properties.Text, 'legacystate\u0001\\u0001'); } finally { await session.stop(); }
});

test('interaction and integration edits participate in undo/redo', () => {
  const document = rewardExample();
  const history = new CommandHistory<typeof document>();
  const edited = history.execute(documentCommand('接入脚本', current => ({ ...current, scripts: { ...current.scripts, integration: previewClass('') } }), robloxStrategy), document);
  assert.notEqual(edited.scripts.integration, document.scripts.integration);
  assert.deepEqual(history.undo(edited), document);
  assert.deepEqual(history.redo(document), edited);
});


test('new shared UI base is registered and generated classes remain FC UI components', async () => {
  assert.ok((await readFile(resolve(directory, 'bootstrap.luau'), 'utf8')).includes(uiEditorCompSource));
  const document = robloxStrategy.createDocument('SharedContract');
  document.scripts.source = `local FX = _G.FX
local UI = FX.Class("CSharedContractUIBaseCompClass", "CUIEditorUICompClass")
function UI:OnReady()
    assert(self:IsA("CUIEditorUICompClass"))
    assert(FX.GetClass("CUIEditorUICompClass").Ctor ~= FX.GetClass("FCUICompClass").Ctor)
    assert(FX.GetClass("CUIEditorUICompClass").RefreshUI ~= FX.GetClass("FCUICompClass").RefreshUI)
    assert(self:GetCompName() == "ScreenGuiComp")
    assert(self:GetRootNode().Name == "ScreenGui")
    assert(self:IsA("FCUICompClass"))
    assert(FX.GetClass("CUIEditorUICompClass").Super == FX.GetClass("FCUICompClass"))
    self:EmitUIAction("Ready", { Id = "contract" })
end
function UI:Render(state)
    assert(state.Ready == true)
end
return UI`;
  document.scripts.integration = `local FX = _G.FX
local Preview = FX.Class("CSharedContractUIPreviewCompClass", "CSharedContractUIBaseCompClass")
function Preview:Ctor(owner)
    Preview.Super.Ctor(self, owner)
    self.Config = {}
    self.State = { Ready = true }
end
return Preview`;
  const { session, frame } = await LuauSession.start(directory, document);
  try { assert.match(frame.logs[0].message, /Ready.*contract/); }
  finally { await session.stop(); }
});


test('runtime templates clone independently, attach, dispatch and destroy without changing the document', async () => {
  const document = rewardExample();
  const template = robloxStrategy.createNode('ImageLabel');
  template.name = 'Template';
  template.imageAssetId = 'reward-icon';
  template.previewImage = { name: 'reward.png', dataUrl: 'data:image/png;base64,YQ==' };
  const button = robloxStrategy.createNode('TextButton');
  button.name = 'Claim';
  template.children.push(button, robloxStrategy.createNode('UICorner'));
  document.root.children.push(template);
  document.scripts.source = sourceClass(`function UI:OnReady()
 local root = self:GetRootNode()
 local template = root.Template
 template.Visible = false
 template.Claim.Activated:Connect(function() error("template handler copied") end)
 self.Items = {}
 for _, rewardId in ipairs({"online_5", "online_10"}) do
  local item = template:Clone()
  assert(item.Parent == nil and #item:GetChildren() == 2)
  item.Name = rewardId
  item.Visible = true
  item.Claim.Text = rewardId
  item.Parent = root
  assert(FX.Loader:Here(root, rewardId .. ".Claim") == item.Claim)
  self.Items[rewardId] = item
  local connection
  connection = self:TrackConnection(item.Claim.Activated:Connect(function()
   self:EmitUIAction("Claim", { RewardId = rewardId })
   item:Destroy()
   item:Destroy()
   assert(item.Parent == nil and not connection.Connected)
  end))
 end
end`);
  document.scripts.integration = previewClass('');
  const original = JSON.stringify(document);
  const { session, frame } = await LuauSession.start(directory, document);
  try {
    const first = frame.document.root.children.find(node => node.name === 'online_5')!;
    const second = frame.document.root.children.find(node => node.name === 'online_10')!;
    assert.notEqual(first.id, template.id);
    assert.notEqual(first.children[0].id, second.children[0].id);
    assert.deepEqual(first.previewImage, template.previewImage);
    assert.equal(first.imageAssetId, template.imageAssetId);
    assert.equal(first.children[0].properties.Text, 'online_5');
    assert.equal(second.children[0].properties.Text, 'online_10');
    assert.equal(findNode(frame.document.root, button.id)!.properties.Text, button.properties.Text);
    const claimed = await session.command({ type: 'event', node: first.children[0].id });
    assert.match(claimed.logs[0].message, /Claim.*online_5/);
    assert.equal(findNode(claimed.document.root, first.id), undefined);
    assert.ok(findNode(claimed.document.root, second.id));
    await assert.rejects(session.command({ type: 'event', node: first.children[0].id }), /无效的按钮/);
    assert.equal(JSON.stringify(document), original);
  } finally { await session.stop(); }
});


test('detached clones retain state and connections until reattached; destruction disconnects connections', async () => {
  const { session, frame } = await start(`function UI:OnReady()
 local root = self:GetRootNode()
 local template = root.ClaimButton
 self.item = template:Clone()
 self.item.Name = "Detached"
 self.item.Text = "independent"
 local connection = self.item.Activated:Connect(function() print("clone-click") end)
 template.Activated:Connect(function()
  if not self.item.Parent then
   self.item.Parent = root
  elseif not self.removed then
   self.item.Parent = nil
   self.removed = true
  else
   self.item:Destroy()
   assert(not connection.Connected)
   assert(not pcall(function() self.item.Parent = root end))
  end
 end)
end`);
  const originalButton = buttonId(frame.document);
  try {
    assert.equal(frame.document.root.children.some(node => node.name === 'Detached'), false);
    const attached = await session.command({ type: 'event', node: originalButton });
    const item = attached.document.root.children.find(node => node.name === 'Detached')!;
    assert.equal(item.properties.Text, 'independent');
    assert.equal((await session.command({ type: 'event', node: item.id })).logs[0].message, 'clone-click');
    const detached = await session.command({ type: 'event', node: originalButton });
    assert.equal(findNode(detached.document.root, item.id), undefined);
    const reattached = await session.command({ type: 'event', node: originalButton });
    assert.equal(findNode(reattached.document.root, item.id)!.properties.Text, 'independent');
    const destroyed = await session.command({ type: 'event', node: originalButton });
    assert.equal(findNode(destroyed.document.root, item.id), undefined);
  } finally { await session.stop(); }
});

test('invalid runtime topology is rejected without committing a partial frame', async () => {
  for (const mutation of [
    'button.Parent = button',
    'root.Parent = button',
    'root:Destroy()',
    'button.Parent = {}',
    'button.Name = " "',
  ]) {
    await assert.rejects(start(`function UI:OnReady()
 local root = self:GetRootNode()
 local button = root.ClaimButton
 ${mutation}
end`), /Cannot|Parent must|non-empty/);
  }
  const { session, frame } = await start(`function UI:OnReady()
 local root = self:GetRootNode()
 root.ClaimButton.Activated:Connect(function()
  local copy = root.ClaimButton:Clone()
  copy.Name = "Invalid"
  copy.TextSize = -1
  copy.Parent = root
 end)
end`);
  const before = JSON.stringify(frame);
  await assert.rejects(session.command({ type: 'event', node: buttonId(frame.document) }), /属性/);
  assert.equal(JSON.stringify(frame), before);
  await assert.rejects(session.command({ type: 'show' }), /结束/);
});
