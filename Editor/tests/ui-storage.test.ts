import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readDocument, writeDocument, readPreviewImage, safeFileName, listDocumentAssets, openDocumentAsset } from '../electron/documents';
import { robloxStrategy } from '../src/editor/roblox';

test('工程资产列出界面文件，打开校验文档并拒绝工程外路径', async () => {
  const project = await mkdtemp(join(tmpdir(), 'ui-assets-'));
  assert.deepEqual(await listDocumentAssets(project), []);
  const path = join(project, 'interfaces', '在线奖励.rbxui.json');
  const document = robloxStrategy.createDocument('在线奖励');
  await writeDocument(path, document);
  await writeFile(join(project, 'interfaces', '说明.txt'), '说明');
  await mkdir(join(project, 'interfaces', '目录.rbxui.json'));
  assert.deepEqual(await listDocumentAssets(project), [{ name: '在线奖励', path }]);
  assert.deepEqual(await openDocumentAsset(project, path), { path, document });
  const outside = join(project, '外部.rbxui.json');
  await writeDocument(outside, document);
  await assert.rejects(openDocumentAsset(project, outside), /当前工程/);
  await assert.rejects(openDocumentAsset(project, {}), /当前工程/);
  await writeFile(path, '{bad');
  await assert.rejects(openDocumentAsset(project, path), /JSON/);
});

test('中文界面原子保存、重新打开与覆盖，不保存会话字段', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ui-document-'));
  const path = join(directory, 'interfaces', '在线奖励.rbxui.json');
  const document = robloxStrategy.createDocument('在线奖励');
  await writeDocument(path, document);
  assert.deepEqual(await readDocument(path), document);
  document.root.name = 'Rewards'; await writeDocument(path, document);
  assert.deepEqual(await readDocument(path), document);
  assert.deepEqual(await readdir(join(directory, 'interfaces')), ['在线奖励.rbxui.json']);
});

test('无效输入或写入失败不破坏已有文件；坏文件拒绝读取', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ui-invalid-'));
  const path = join(directory, 'reward.rbxui.json');
  const document = robloxStrategy.createDocument();
  await writeDocument(path, document);
  const content = await readFile(path, 'utf8');
  await assert.rejects(writeDocument(path, { ...document, version: 3 }));
  assert.equal(await readFile(path, 'utf8'), content);
  const blocked = join(directory, 'blocked.rbxui.json'); await mkdir(blocked);
  await assert.rejects(writeDocument(blocked, document));
  assert.equal((await readdir(directory)).some(name => name.endsWith('.tmp')), false);
  await writeFile(path, '{bad'); await assert.rejects(readDocument(path), /JSON/);
});

test('预览图片嵌入后不依赖原路径，拒绝非图片和外部 URL', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ui-image-'));
  const path = join(directory, '图标.png');
  await writeFile(path, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6ioAAAAASUVORK5CYII=', 'base64'));
  const preview = await readPreviewImage(path);
  const document = robloxStrategy.createDocument(), image = robloxStrategy.createNode('ImageLabel');
  image.previewImage = preview; document.root.children.push(image);
  const savedPath = join(directory, '界面.rbxui.json'); await writeDocument(savedPath, document);
  assert.deepEqual((await readDocument(savedPath)).root.children[0].previewImage, preview);
  image.previewImage.dataUrl = 'https://example.com/image.png'; assert.throws(() => robloxStrategy.validate(document));
  await writeFile(path, 'not an image'); await assert.rejects(readPreviewImage(path));
  assert.equal(safeFileName('../在线:奖励'), '.._在线_奖励');
  assert.equal(safeFileName('CON'), '_CON');
});
