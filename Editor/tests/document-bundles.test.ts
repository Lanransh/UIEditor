import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, writeFile, lstat, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { documentBundlePath, documentScriptPaths, readDocument, writeDocument, saveDocumentBundle, listDocumentAssets, moveDocumentAsset, listTemplateFolders } from '../electron/documents';
import { saveInterface, openInterface } from '../electron/automation-files';
import { robloxStrategy } from '../src/editor/roblox';
import { createRobloxImportPackage } from '../src/shared/robloxImport';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ui-bundle-'));
  const document = robloxStrategy.createDocument('RewardUI');
  const path = documentBundlePath(join(root, 'interfaces', 'RewardUI.json'));
  await writeDocument(path, document);
  return { root, path, document };
}

test('new saved UI owns one directory and reopens by the returned relative path', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ui-create-bundle-')));
  const document = robloxStrategy.createDocument('RewardUI');
  const saved = await saveInterface(root, 'RewardUI.json', document, true);
  assert.equal(saved.path, join(root, 'interfaces', 'RewardUI', 'RewardUI.json'));
  assert.deepEqual((await readdir(join(root, 'interfaces'))), ['RewardUI']);
  assert.deepEqual((await readdir(join(root, 'interfaces', 'RewardUI'))).sort(), ['RewardUI.example.luau', 'RewardUI.json', 'RewardUI.view.luau']);
  assert.deepEqual((await openInterface(root, relative(join(root, 'interfaces'), saved.path))).document, document);
  assert.deepEqual(await listDocumentAssets(root), [{ name: 'RewardUI', path: saved.path }]);
});

test('saving a renamed UI renames its directory and three files, preserving IDs, source and companion files', async () => {
  const { root, path, document } = await fixture();
  const before = createRobloxImportPackage(document);
  await writeFile(join(root, 'interfaces', 'RewardUI', 'notes.md'), 'keep notes');
  const saved = await saveDocumentBundle(path, { ...document, name: 'OnlineRewardUI' });
  assert.equal(saved.path, join(root, 'interfaces', 'OnlineRewardUI', 'OnlineRewardUI.json'));
  await assert.rejects(lstat(join(root, 'interfaces', 'RewardUI')), /ENOENT/);
  assert.deepEqual((await readdir(join(root, 'interfaces', 'OnlineRewardUI'))).sort(), ['OnlineRewardUI.example.luau', 'OnlineRewardUI.json', 'OnlineRewardUI.view.luau', 'notes.md']);
  const reopened = await readDocument(saved.path);
  assert.equal(reopened.id, document.id); assert.deepEqual(reopened.root, document.root);
  assert.deepEqual(reopened.scripts, document.scripts);
  assert.equal(reopened.name, 'OnlineRewardUI');
  assert.equal(await readFile(join(root, 'interfaces', 'OnlineRewardUI', 'notes.md'), 'utf8'), 'keep notes');
  assert.deepEqual(createRobloxImportPackage(reopened).model, before.model);
  assert.deepEqual(createRobloxImportPackage(reopened).scripts, before.scripts);
  assert.deepEqual(await listDocumentAssets(root), [{ name: 'OnlineRewardUI', path: saved.path }]);
});

test('name collisions and invalid documents preserve the original UI and do not overwrite target directories', async () => {
  const { root, path, document } = await fixture();
  await mkdir(join(root, 'interfaces', 'ExistingUI'));
  await assert.rejects(saveDocumentBundle(path, { ...document, name: 'ExistingUI' }), /同名/);
  assert.deepEqual(await readDocument(path), document);
  assert.deepEqual(await readdir(join(root, 'interfaces', 'ExistingUI')), []);
  await assert.rejects(saveDocumentBundle(path, { ...document, name: 'InvalidUI', version: 99 }));
  assert.deepEqual(await readDocument(path), document);
  await assert.rejects(lstat(join(root, 'interfaces', 'InvalidUI')), /ENOENT/);
});

test('case-only renames update directory and all three filenames', async () => {
  const { root, path, document } = await fixture();
  const saved = await saveDocumentBundle(path, { ...document, name: 'rewardUI' });
  assert.equal(saved.path, join(root, 'interfaces', 'rewardUI', 'rewardUI.json'));
  assert.deepEqual(await readdir(join(root, 'interfaces')), ['rewardUI']);
  assert.deepEqual((await readdir(join(root, 'interfaces', 'rewardUI'))).sort(), ['rewardUI.example.luau', 'rewardUI.json', 'rewardUI.view.luau']);
  assert.deepEqual((await readDocument(saved.path)).scripts, document.scripts);
});

test('moving UI libraries carries its bundle and template folder choices exclude UI directories', async () => {
  const { root, path, document } = await fixture();
  await mkdir(join(root, 'styles', 'templates', 'Windows'), { recursive: true });
  const moved = await moveDocumentAsset(root, path, 'project', root, 'templates');
  assert.equal(moved.path, join(root, 'styles', 'templates', 'RewardUI', 'RewardUI.json'));
  assert.deepEqual(await readDocument(moved.path), document);
  await assert.rejects(lstat(join(root, 'interfaces', 'RewardUI')), /ENOENT/);
  assert.deepEqual(await listTemplateFolders(root), ['Windows']);
  assert.equal(await readFile(documentScriptPaths(moved.path).source, 'utf8'), document.scripts.source);
});
