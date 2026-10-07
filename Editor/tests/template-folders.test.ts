import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listTemplateFolders, templateFolderPath, listDocumentAssets, writeDocument } from '../electron/documents';
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
