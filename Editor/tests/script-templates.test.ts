import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interfaceNameError, scriptClassNames } from '../src/shared/uiDocument';
import { robloxStrategy } from '../src/editor/roblox';

test('new interfaces reject invalid identifiers and reserved names', () => {
  for (const name of ['', '在线奖励', '2Reward', 'Reward UI', 'Reward-UI', 'end', 'local', 'continue', 'type']) {
    assert.ok(interfaceNameError(name), name);
    assert.throws(() => robloxStrategy.createDocument(name));
  }
  for (const name of ['Reward', '_Reward2', 'Reward_UI', ' OnlineReward ']) assert.equal(interfaceNameError(name), '');
});

test('named empty templates inherit the generated base and preserve source on round-trip and rename', () => {
  const document = robloxStrategy.createDocument(' OnlineReward ');
  assert.equal(document.name, 'OnlineReward');
  assert.deepEqual(scriptClassNames(document.name), { source: 'COnlineRewardUIBaseCompClass', integration: 'COnlineRewardUIPreviewCompClass' });
  assert.match(document.scripts.source, /local COnlineRewardUIBaseCompClass = FX.Class\("COnlineRewardUIBaseCompClass", "FCUICompClass"\)/);
  assert.match(document.scripts.integration, /FX.Class\("COnlineRewardUIPreviewCompClass", "COnlineRewardUIBaseCompClass"\)/);
  assert.doesNotMatch(document.scripts.integration, /print\(|RewardId|ClaimReward/);
  assert.equal(document.root.children.length, 0);
  assert.deepEqual(robloxStrategy.validate(JSON.parse(JSON.stringify(document))), document);
  assert.deepEqual(robloxStrategy.validate({ ...document, name: '其他名称' }).scripts, document.scripts);
});
