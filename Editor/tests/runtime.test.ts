import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { LuauSession, RuntimeError } from '../electron/runtime';
import { robloxStrategy } from '../src/editor/roblox';
import { rewardExample } from '../src/editor/scriptExample';
import { findNode } from '../src/shared/uiDocument';
import { validateReferences } from '../src/shared/runtime';
import { CommandHistory } from '../src/history/CommandHistory';
import { documentCommand } from '../src/editor/commands';

const directory = resolve('native-bin');
async function start(source: string, config = 'return {}') {
  const document = rewardExample();
  document.scripts.source = source; document.scripts.config = config;
  return LuauSession.start(directory, document);
}
test('scripts round-trip; old formats are rejected and stale references remain editable but cannot run', () => {
  const example = rewardExample();
  assert.deepEqual(robloxStrategy.validate(JSON.parse(JSON.stringify(example))), example);
  const { scripts, ...legacy } = example;
  assert.throws(() => robloxStrategy.validate({ ...legacy, version: 1 }), /版本/);
  example.root.children[2].name = 'Changed';
  validateReferences(example);
  example.root.children.pop();
  assert.doesNotThrow(() => robloxStrategy.validate(example));
  assert.throws(() => validateReferences(example), /ClaimButton/);
});
test('real Luau runs reward display, readonly data, click actions and live state refresh', async () => {
  const document = rewardExample(), original = JSON.stringify(document);
  const { session, frame } = await LuauSession.start(directory, document);
  const button = document.scripts.references.ClaimButton;
  try {
    assert.equal(findNode(frame.document.root, button)?.properties.Text, '120 seconds remaining');
    assert.deepEqual(frame.disabled, [button]);
    assert.equal((await session.command({ type: 'event', node: button })).logs.length, 0);
    const ready = await session.command({ type: 'state', state: { Status: 'Claimable', RemainingSeconds: 0, Pending: false } });
    assert.equal(findNode(ready.document.root, button)?.properties.BackgroundColor3, '#42b883');
    const action = await session.command({ type: 'event', node: button });
    assert.match(action.logs[0].message, /ClaimReward.*online_5min/);
    const claimed = await session.command({ type: 'state', state: { Status: 'Claimed', RemainingSeconds: 0, Pending: false } });
    assert.equal(findNode(claimed.document.root, button)?.properties.Text, 'Claimed');
    assert.equal(JSON.stringify(document), original);
  } finally { await session.stop(); }
  await assert.rejects(session.command({ type: 'event', node: button }), /结束/);
});
test('compile and runtime errors retain original interface line numbers', async () => {
  await assert.rejects(start('function UI:Render(\n'), /interface:2|interface:1/);
  await assert.rejects(start('function UI:Render(state)\n error("broken")\nend'), /interface:2.*broken/);
  await assert.rejects(start('function UI:Render(state)\n self.UI:Set("Missing", "Text", "value")\nend'), /interface:2/);
  await assert.rejects(start('function UI:RefreshUI() end'), /reserved/);
  await assert.rejects(start('function UI:Render(state) state.Status = "Changed" end'), /readonly/);
  await assert.rejects(start('function UI:Render() self:GetUIConfig().value = 3 end', 'return {value = 1}'), /readonly/);
  await assert.rejects(start('print("before-error")\nwarn("before-warning")\nerror("after-print")'), error => {
    assert.ok(error instanceof RuntimeError);
    assert.match(error.message, /interface:3.*after-print/);
    assert.deepEqual(error.logs, [{ kind: 'output', message: 'before-error' }, { kind: 'warning', message: 'before-warning' }]);
    return true;
  });
});
test('callback updates are atomic and failed sessions are terminated', async () => {
  const { session, frame } = await start(`function UI:OnMount()
 self.UI:On("ClaimButton", "Activated", function()
  self.UI:Set("ClaimButton", "Text", "partial")
  self.UI:Set("ClaimButton", "TextSize", -3)
 end)
end`);
  const button = frame.document.scripts.references.ClaimButton;
  const before = JSON.stringify(frame.document);
  await assert.rejects(session.command({ type: 'event', node: button }), /属性/);
  assert.equal(JSON.stringify(frame.document), before);
  await assert.rejects(session.command({ type: 'event', node: button }), /结束/);
});
test('connections disconnect, print is framed, and sessions never share local state', async () => {
  for (let index = 0; index < 2; index++) {
    const { session, frame } = await start(`function UI:OnMount()
 self.count = 0
 local connection = self.UI:On("ClaimButton", "Activated", function() error("disconnected") end)
 connection:Disconnect()
 self.UI:On("ClaimButton", "Activated", function()
  self.count += 1
  print("count", self.count)
 end)
end`);
    try {
      const result = await session.command({ type: 'event', node: frame.document.scripts.references.ClaimButton });
      assert.equal(result.logs[0].message, 'count\t1');
    } finally { await session.stop(); }
  }
});
test('infinite loops and allocations terminate without hanging the parent', async () => {
  await assert.rejects(start('while true do end'), /250 ms|超时|退出/);
  await assert.rejects(start('local bytes = buffer.create(100 * 1024 * 1024)'), /memory|内存|退出/);
});
test('host system access is absent and serializable empty arrays survive data round-trip', async () => {
  const document = rewardExample();
  document.scripts.state = { items: [], empty: {}, nullable: null };
  document.scripts.source = `function UI:Render(state)
 assert(_G == nil and game == nil and require == nil and io == nil and loadstring == nil)
 self:EmitUIAction("data", state)
end`;
  const { session, frame } = await LuauSession.start(directory, document);
  try { assert.match(frame.logs[0].message, /"items":\[\]/); } finally { await session.stop(); }
});
test('static documents run without hooks', async () => {
  const document = robloxStrategy.createDocument();
  const { session, frame } = await LuauSession.start(directory, document);
  try { assert.deepEqual(frame.document, document); } finally { await session.stop(); }
});

test('authored integration inherits UI, overrides business hooks, and simulates a claim', async () => {
  const document = rewardExample();
  document.scripts.state = { Status: 'Claimable', RemainingSeconds: 0, Pending: false };
  const { session, frame } = await LuauSession.start(directory, document);
  try {
    const button = document.scripts.references.ClaimButton;
    assert.equal(findNode(frame.document.root, button)?.properties.Text, 'Ready');
    const claimed = await session.command({ type: 'event', node: button });
    assert.equal(findNode(claimed.document.root, button)?.properties.Text, 'Claimed');
    assert.deepEqual(claimed.logs.map(log => log.kind), ['action', 'output']);
    assert.deepEqual(claimed.disabled, [button]);
    assert.equal((await session.command({ type: 'event', node: button })).logs.length, 0);
    assert.equal(document.scripts.state.Status, 'Claimable');
  } finally { await session.stop(); }
  document.scripts.integration = 'function Preview:GetUIState()\n error("integration-error")\nend';
  await assert.rejects(LuauSession.start(directory, document), /integration:2.*integration-error/);
  document.scripts.integration = 'function Preview:Render() end';
  await assert.rejects(LuauSession.start(directory, document), /reserved preview method/);
});

test('UI Roblox values work across config, interface and integration without leaking into saved data', async () => {
  const document = rewardExample();
  document.scripts.config = 'return { Size = UDim2.fromOffset(300, 80), Color = Color3.fromRGB(66, 184, 131), Font = Enum.Font.Gotham }';
  document.scripts.source = `function UI:Render(state)
 local config = self:GetUIConfig()
 assert(typeof(config.Size) == "UDim2" and config.Size.X.Offset == 300)
 self.UI:Set("ClaimButton", "Size", config.Size)
 self.UI:Set("ClaimButton", "AnchorPoint", Vector2.new(0.5, 0.5))
 self.UI:Set("ClaimButton", "BackgroundColor3", config.Color)
 self.UI:Set("ClaimButton", "Font", config.Font)
 assert(typeof(self.UI:Get("ClaimButton", "Size")) == "UDim2")
 assert(self.UI:Get("ClaimButton", "Font") == Enum.Font.Gotham)
 assert(self.UI:Get("ClaimButton", "BackgroundColor3").G == 184 / 255)
 assert(UDim2.new(UDim.new(0.5, 10), UDim.new(1, 20)).Width.Scale == 0.5)
 print("types", typeof(UDim.new()), typeof(Vector2.new()), typeof(Color3.new()), typeof(Enum.Font.Gotham))
 warn("preview-warning")
end`;
  document.scripts.integration = `function Preview:GetUIState()
 assert(typeof(UDim2.fromScale(1, 1)) == "UDim2")
 return self.State
end`;
  const original = JSON.stringify(document);
  const { session, frame } = await LuauSession.start(directory, document);
  try {
    const button = findNode(frame.document.root, document.scripts.references.ClaimButton)!;
    assert.deepEqual(button.properties.Size, { x: { scale: 0, offset: 300 }, y: { scale: 0, offset: 80 } });
    assert.deepEqual(button.properties.AnchorPoint, { x: 0.5, y: 0.5 });
    assert.equal(button.properties.BackgroundColor3, '#42b883');
    assert.equal(button.properties.Font, 'Gotham');
    assert.deepEqual(frame.logs.map(log => log.kind), ['output', 'warning']);
    assert.equal(JSON.stringify(document), original);
  } finally { await session.stop(); }
  await assert.rejects(start('function UI:Render() self.UI:Set("ClaimButton", "Text", Vector2.new()) end'), /Wrong Roblox value type/);
  await assert.rejects(start('function UI:Render() self.UI:Set("ClaimButton", "Font", Enum.TextXAlignment.Center) end'), /Wrong enum type/);
  await assert.rejects(start('function UI:Render() local size = UDim2.new() size.X.Offset = 2 end'), /readonly/);
});

test('existing version 2 documents gain integration and malformed integration is rejected', () => {
  const document = rewardExample();
  const { integration, ...scripts } = document.scripts;
  const loaded = robloxStrategy.validate({ ...document, scripts });
  assert.match(loaded.scripts.integration, /Preview:GetUIState/);
  assert.throws(() => robloxStrategy.validate({ ...document, scripts: { ...scripts, integration: 123 } }), /脚本/);
  assert.throws(() => robloxStrategy.validate({ ...document, scripts: { ...scripts, integration: 'x'.repeat(262145) } }), /脚本/);
});
test('script and state edits participate in undo/redo and preserve saved baseline', () => {
  const document = rewardExample();
  const history = new CommandHistory<typeof document>();
  const edited = history.execute(documentCommand('脚本与状态', current => ({ ...current, scripts: { ...current.scripts, source: 'function UI:Render(state) print(state.Status) end', state: { Status: 'Claimed' } } }), robloxStrategy), document);
  assert.equal(edited.scripts.state && (edited.scripts.state as { Status: string }).Status, 'Claimed');
  assert.deepEqual(history.undo(edited), document);
  assert.deepEqual(history.redo(document), edited);
});
test('nested data crosses the native stack safely and remains readonly', async () => {
  const document = rewardExample();
  let state: Record<string, any> = { value: 'deep' };
  for (let index = 0; index < 50; index++) state = { next: state };
  document.scripts.state = state;
  document.scripts.source = `function UI:Render(state)
 for index = 1, 50 do state = state.next end
 self.UI:Set("StatusText", "Text", state.value)
end`;
  const { session, frame } = await LuauSession.start(directory, document);
  try { assert.equal(findNode(frame.document.root, document.scripts.references.StatusText)?.properties.Text, 'deep'); } finally { await session.stop(); }
});
