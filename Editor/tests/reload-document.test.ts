import { test } from 'node:test';
import assert from 'node:assert/strict';
import { robloxStrategy } from '../src/editor/roblox';
import { mergeSavedDocument } from '../src/editor/reloadDocument';

test('external scripts load without losing unsaved UI edits or independently edited scripts', () => {
  const saved = robloxStrategy.createDocument('ExternalEdit');
  const current = structuredClone(saved), disk = structuredClone(saved);
  current.root.properties.Enabled = false;
  current.scripts.integration += '\n-- local preview edit';
  disk.scripts.source += '\n-- external view edit';
  const merged = mergeSavedDocument(saved, current, disk);
  assert.equal(merged.root.properties.Enabled, false);
  assert.equal(merged.scripts.source, disk.scripts.source);
  assert.equal(merged.scripts.integration, current.scripts.integration);
  assert.equal(saved.root.properties.Enabled, true);
});

test('clean UI loads external JSON changes while preserving a local script edit', () => {
  const saved = robloxStrategy.createDocument('ExternalEdit');
  const current = structuredClone(saved), disk = structuredClone(saved);
  current.scripts.source += '\n-- local';
  disk.root.name = 'RenamedRoot';
  const merged = mergeSavedDocument(saved, current, disk);
  assert.equal(merged.root.name, 'RenamedRoot');
  assert.equal(merged.scripts.source, current.scripts.source);
});

test('same script edits are accepted; differing edits are rejected before overwriting either version', () => {
  const saved = robloxStrategy.createDocument('ExternalEdit');
  for (const kind of ['source', 'integration'] as const) {
    const current = structuredClone(saved), disk = structuredClone(saved);
    current.scripts[kind] += '\n-- same';
    disk.scripts[kind] = current.scripts[kind];
    assert.equal(mergeSavedDocument(saved, current, disk).scripts[kind], current.scripts[kind]);
    disk.scripts[kind] += '\n-- different';
    assert.throws(() => mergeSavedDocument(saved, current, disk), /App 和文件中都已修改/);
    assert.ok(current.scripts[kind].endsWith('-- same'));
    assert.ok(disk.scripts[kind].endsWith('-- different'));
  }
});

test('conflicting UI changes are rejected rather than losing node edits', () => {
  const saved = robloxStrategy.createDocument('ExternalEdit');
  const current = structuredClone(saved), disk = structuredClone(saved);
  current.root.name = 'LocalRoot';
  disk.root.name = 'ExternalRoot';
  assert.throws(() => mergeSavedDocument(saved, current, disk), /UI.*都已修改/);
});
