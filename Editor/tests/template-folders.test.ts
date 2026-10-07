import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listTemplateFolders, templateFolderPath, listDocumentAssets, openDocumentAsset, writeDocument } from '../electron/documents';
import { robloxStrategy } from '../src/editor/roblox';

test('模板文件夹持久化、递归资产读取与路径校验', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ui-template-folders-'));
  try {
    assert.deepEqual(await listTemplateFolders(root), []);
    for (const name of ['', ' ', '..', '../escape', 'a/b', 'a\\b', 'CON', 'trailing.']) {
      assert.throws(() => templateFolderPath(root, name));
    }
    const folder = templateFolderPath(root, '奖励界面');
    await mkdir(folder, { recursive: true });
    assert.deepEqual(await listTemplateFolders(root), ['奖励界面']);
    await assert.rejects(mkdir(folder), { code: 'EEXIST' });
    const path = join(folder, 'Reward.rbxui.json');
    await writeDocument(path, robloxStrategy.createDocument('Reward'));
    assert.deepEqual(await listDocumentAssets(root, 'templates'), [{ name: 'Reward', path }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('模板参考随工程目录移动，其他工程不共享模板或文件夹', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ui-project-templates-'));
  try {
    const first = join(root, 'first'), second = join(root, 'second'), moved = join(root, 'moved');
    const folder = templateFolderPath(first, '奖励界面');
    const document = robloxStrategy.createDocument('Reward');
    await writeDocument(join(folder, 'Reward.rbxui.json'), document);
    assert.deepEqual(await listDocumentAssets(second, 'templates'), []);
    assert.deepEqual(await listTemplateFolders(second), []);
    await assert.rejects(openDocumentAsset(second, join(folder, 'Reward.rbxui.json'), 'templates'));
    await rename(first, moved);
    assert.deepEqual(await listTemplateFolders(moved), ['奖励界面']);
    const path = join(templateFolderPath(moved, '奖励界面'), 'Reward.rbxui.json');
    assert.deepEqual(await listDocumentAssets(moved, 'templates'), [{ name: 'Reward', path }]);
    assert.deepEqual((await openDocumentAsset(moved, path, 'templates')).document, document);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
