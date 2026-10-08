import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, unlink, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { openInterface, saveInterface, interfacePath } from '../electron/automation-files';
import { writeDocument } from '../electron/documents';
import { robloxStrategy } from '../src/editor/roblox';
import { validateTool } from '../src/shared/automation-tools';
import { documentLocation } from '../src/shared/documents';

async function workspace() {
  await mkdir(resolve('test-results'), { recursive: true });
  return mkdtemp(resolve('test-results/template-editing-'));
}
test('template edits preserve original identity/path and reject external changes and deletion', async () => {
  const root = await workspace(), relativePath = '奖励/卡片.rbxui.json';
  const path = join(root, 'AgentWorkspace/styles/templates', relativePath);
  const original = robloxStrategy.createDocument('Card');
  await writeDocument(path, original);
  const opened = await openInterface(root, relativePath, 'templates');
  const changed = { ...opened.document, name: 'RenamedCard', scripts: { ...opened.document.scripts, source: '-- edited' } };
  await saveInterface(root, relativePath, changed, false, 'templates', opened.version);
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), changed);
  assert.equal(changed.id, original.id);
  assert.equal(changed.root.id, original.root.id);
  await assert.rejects(readFile(join(root, 'interfaces', relativePath)), /ENOENT/);
  await assert.rejects(saveInterface(root, relativePath, original, false, 'templates', opened.version), /外部修改/);
  const reopened = await openInterface(root, relativePath, 'templates');
  await writeFile(path, JSON.stringify(original));
  await assert.rejects(saveInterface(root, relativePath, changed, false, 'templates', reopened.version), /外部修改/);
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), original);
  await unlink(path);
  await assert.rejects(saveInterface(root, relativePath, changed, false, 'templates', reopened.version), /删除/);
  await assert.rejects(readFile(path), /ENOENT/);
});
test('template paths reject traversal and linked workspace ancestors before creating directories', async () => {
  const root = await workspace(), outside = await workspace();
  for (const path of ['../escape.rbxui.json', 'C:/escape.rbxui.json', './a.rbxui.json', 'bad.txt']) {
    await assert.rejects(interfacePath(root, path, 'templates'));
  }
  const linked = await workspace();
  await symlink(outside, join(linked, 'AgentWorkspace'), 'junction');
  await assert.rejects(interfacePath(linked, 'escape.rbxui.json', 'templates'), /符号链接/);
  await assert.rejects(readFile(join(outside, 'styles/templates/escape.rbxui.json')), /ENOENT/);
});
test('MCP template open requires an explicit mode and an unambiguous target', () => {
  const target = { library: 'templates', documentId: '12345678-1234-4123-8123-123456789abc' };
  const stamp = { sessionId: 'session', revision: 0 };
  validateTool('uie.document.open', { ...stamp, target, mode: 'edit' });
  validateTool('uie.document.open', { ...stamp, target, mode: 'copy' });
  validateTool('uie.document.open', { ...stamp, relativePath: 'a.rbxui.json' });
  assert.throws(() => validateTool('uie.document.open', { ...stamp, target }), /mode/);
  assert.throws(() => validateTool('uie.document.open', { ...stamp, target, mode: 'edit', relativePath: 'a.rbxui.json' }));
  assert.throws(() => validateTool('uie.document.open', { ...stamp, target: { ...target, library: 'permanent' }, mode: 'edit' }));
  assert.throws(() => validateTool('uie.document.open', { ...stamp, target, mode: 'bad' }));
  assert.throws(() => validateTool('uie.document.open', stamp));
  assert.deepEqual(documentLocation('C:/Workspace', 'c:/workspace/AgentWorkspace/styles/templates/a.rbxui.json'), { library: 'templates', relativePath: 'a.rbxui.json' });
  assert.equal(documentLocation('C:/Workspace', 'C:/Workspace2/interfaces/a.rbxui.json'), null);
});
