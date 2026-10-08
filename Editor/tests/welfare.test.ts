import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { LuauSession } from '../electron/runtime';
import { robloxStrategy } from '../src/editor/roblox';
import type { UIDocument, UINode } from '../src/shared/uiDocument';
import { createRobloxImportPackage } from '../src/shared/robloxImport';

const fixture = resolve(import.meta.dirname, 'fixtures/roblox-welfare');
async function document() {
  const value = robloxStrategy.validate(JSON.parse(await readFile(join(fixture, 'UIEditorWorkspace/interfaces/WelfareHub.rbxui.json'), 'utf8')));
  const scripts = {
    source: await readFile(join(fixture, 'CWelfareView.lua'), 'utf8'),
    integration: await readFile(join(fixture, 'CWelfarePreview.lua'), 'utf8'),
  };
  assert.deepEqual(value.scripts, scripts, "Saved fixture must match the reviewable Lua sources");
  return value;
}
function node(document: UIDocument, path: string): UINode {
  return path.split('.').reduce((parent, name) => {
    const child = parent.children.find(item => item.name === name);
    assert.ok(child, path);
    return child;
  }, document.root);
}
const row = (page: string, id: string) => `PopupPanelImg.${page}.ItemsBox.Item_${id}Img`;
const online = row('OnlineBox', 'online_5');
const task = row('TasksBox', 'collect_coins');

test('welfare fixture claims, blocks duplicates, switches tabs and reopens without losing state or duplicating rows', async () => {
  const source = await document();
  const { session, frame } = await LuauSession.start(resolve('native-bin'), source);
  try {
    assert.equal(node(frame.document, 'PopupPanelImg.OnlineBox.ItemsBox').children.length, 6);
    assert.equal(node(frame.document, 'PopupPanelImg.SignInBox.ItemsBox').children.length, 7);
    assert.equal(node(frame.document, 'PopupPanelImg.TasksBox.ItemsBox').children.length, 3);
    const button = node(frame.document, online + '.ClaimBtn').id;
    const claimed = await session.command({ type: 'event', node: button });
    assert.equal(node(claimed.document, online + '.ClaimBtn.ButtonTxt').properties.Text, 'Claimed');
    assert.equal(claimed.logs.filter(log => log.kind === 'action').length, 1);
    assert.match(claimed.logs[0].message, /online_5/);
    assert.equal((await session.command({ type: 'event', node: button })).logs.length, 0);
    const tasks = await session.command({ type: 'event', node: node(frame.document, 'TabsBox.TasksTabBtn').id });
    assert.equal(node(tasks.document, 'PopupPanelImg.TasksBox').properties.Visible, true);
    assert.equal(tasks.logs.length, 0, 'tab is local UI state');
    const result = await session.command({ type: 'event', node: node(tasks.document, task + '.ClaimBtn').id });
    assert.equal(node(result.document, task + '.ClaimBtn.ButtonTxt').properties.Text, 'Claimed');
    const closed = await session.command({ type: 'event', node: node(frame.document, 'TitleBox.CloseSurfaceImg.CloseBtn').id });
    assert.equal(closed.document.root.properties.Enabled, false);
    for (let i = 0; i < 3; i++) {
      const shown = await session.command({ type: 'show' });
      assert.equal(shown.document.root.properties.Enabled, true);
      assert.equal(node(shown.document, online + '.ClaimBtn').id, button);
      assert.equal(node(shown.document, task + '.ClaimBtn.ButtonTxt').properties.Text, 'Claimed');
      await session.command({ type: 'hide' });
    }
    const stopped = await session.command({ type: 'stop' });
    assert.equal(node(stopped.document, 'PopupPanelImg.OnlineBox.ItemsBox').children.length, 0);
  } finally { session.abort(); }
});

test('welfare progress handles negative, zero, overflow and invalid targets; eligibility follows the provided status', async () => {
  for (const [current, target, ratio] of [[-10, 1000, 0], [0, 1000, 0], [1500, 1000, 1], [4, 0, 0]]) {
    const source = await document();
    source.scripts.integration = source.scripts.integration.replace('target = 1000, previewValue = 1000', `target = ${target}, previewValue = ${current}`);
    const { session, frame } = await LuauSession.start(resolve('native-bin'), source);
    try {
      assert.deepEqual(node(frame.document, task + '.ProgressBarImg.ProgressFillImg').properties.Size, { x: { scale: ratio, offset: 0 }, y: { scale: 1, offset: 0 } });
      assert.equal(node(frame.document, task + '.ProgressBarImg.ProgressTxt').properties.Text, target > 0 ? `${current} / ${target}` : '—');
    } finally { await session.stop(); }
  }
  const source = await document();
  source.scripts.integration = source.scripts.integration.replace('return CWelfarePreview', `local Initialize = CWelfarePreview.Ctor
function CWelfarePreview:Ctor(owner)
 Initialize(self, owner)
 self.State.entries.task.collect_coins.status = "Locked"
end
return CWelfarePreview`);
  const { session, frame } = await LuauSession.start(resolve('native-bin'), source);
  try { assert.ok(frame.disabled.includes(node(frame.document, task + '.ClaimBtn').id)); }
  finally { await session.stop(); }
});

test('welfare failed claim can retry and pending entries cannot dispatch', async () => {
  const source = await document();
  source.scripts.integration = source.scripts.integration.replace('self.FailNextClaim = false', 'self.FailNextClaim = true');
  const { session, frame } = await LuauSession.start(resolve('native-bin'), source);
  try {
    const id = node(frame.document, online + '.ClaimBtn').id;
    const failed = await session.command({ type: 'event', node: id });
    assert.equal(node(failed.document, online + '.ClaimBtn.ButtonTxt').properties.Text, 'Retry');
    const success = await session.command({ type: 'event', node: id });
    assert.equal(node(success.document, online + '.ClaimBtn.ButtonTxt').properties.Text, 'Claimed');
  } finally { await session.stop(); }
  const pending = await document();
  pending.scripts.integration = pending.scripts.integration.replace('pending = false, current', 'pending = true, current');
  const running = await LuauSession.start(resolve('native-bin'), pending);
  try {
    const id = node(running.frame.document, online + '.ClaimBtn').id;
    assert.equal(node(running.frame.document, online + '.ClaimBtn.ButtonTxt').properties.Text, 'Claiming...');
    assert.ok(running.frame.disabled.includes(id));
    assert.equal((await running.session.command({ type: 'event', node: id })).logs.length, 0);
  } finally { await running.session.stop(); }
});

test('welfare list removes owned nodes and reuses stable IDs after reordering and reward changes', async () => {
  const source = await document();
  source.scripts.integration = source.scripts.integration.replace('return CWelfarePreview', `local Claim = CWelfarePreview.OnUIAction
function CWelfarePreview:OnUIAction(action, payload)
 Claim(self, action, payload)
 if payload.rewardId == "online_5" then
  local items = self.Config.groups[1].items
  table.remove(items, 1)
  items[1].reward = { type = "Currency", id = "Diamond", amount = 77 }
  items[1], items[2] = items[2], items[1]
  self:RefreshUI()
 end
end
return CWelfarePreview`);
  const { session, frame } = await LuauSession.start(resolve('native-bin'), source);
  try {
    const preserved = row('OnlineBox', 'online_10');
    const id = node(frame.document, preserved).id;
    const changed = await session.command({ type: 'event', node: node(frame.document, online + '.ClaimBtn').id });
    const items = node(changed.document, 'PopupPanelImg.OnlineBox.ItemsBox').children;
    assert.equal(items.length, 5);
    assert.ok(!items.some(item => item.name === 'Item_online_5Img'));
    assert.equal(node(changed.document, preserved).id, id);
    assert.equal(node(changed.document, preserved).properties.LayoutOrder, 2);
    assert.equal(node(changed.document, preserved + '.RewardTxt').properties.Text, 'Diamonds ×77');
    assert.equal(node(changed.document, preserved + '.CoinIconBox').properties.Visible, false);
    assert.equal(node(changed.document, preserved + '.GemIconBox').properties.Visible, true);
    const claimed = await session.command({ type: 'event', node: node(changed.document, preserved + '.ClaimBtn').id });
    assert.equal(claimed.logs.filter(log => log.kind === 'action').length, 1);
    assert.match(claimed.logs[0].message, /online_10/);
  } finally { await session.stop(); }
});

test('welfare exports the View and common base without preview business or absolute project paths', async () => {
  const source = await document();
  const pack = createRobloxImportPackage(source);
  assert.match(pack.scripts.source, /CWelfareView/);
  assert.match(pack.scripts.source, /require\(script.Parent.CUIView\)/);
  assert.doesNotMatch(pack.scripts.source, /CWelfarePreview|FailNextClaim/);
  assert.doesNotMatch(JSON.stringify(pack), /Roblox_Y1|C:\\\\work/);
});
