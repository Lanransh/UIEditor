import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readDocument, writeDocument, readPreviewImage, safeFileName, listDocumentAssets, openDocumentAsset, moveDocumentAsset } from '../electron/documents';
import { robloxStrategy } from '../src/editor/roblox';

test('工程资产列出界面文件，打开校验文档并拒绝工程外路径', async () => {
  const project = await mkdtemp(join(tmpdir(), 'ui-assets-'));
  assert.deepEqual(await listDocumentAssets(project), []);
  const path = join(project, 'interfaces', '在线奖励.rbxui.json');
  const document = robloxStrategy.createDocument('OnlineReward');
  document.name = '在线奖励';
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
  const document = robloxStrategy.createDocument('OnlineReward');
  document.name = '在线奖励';
  await writeDocument(path, document);
  assert.deepEqual(await readDocument(path), document);
  document.root.name = 'Rewards'; await writeDocument(path, document);
  assert.deepEqual(await readDocument(path), document);
  assert.deepEqual(await readdir(join(directory, 'interfaces')), ['在线奖励.rbxui.json']);
});

test('项目UI包含多层子目录文件，保留同名资产并跳过目录链接', async () => {
  const project = await mkdtemp(join(tmpdir(), 'ui-nested-assets-'));
  const document = robloxStrategy.createDocument('TemplatePage');
  const paths = [
    join(project, 'interfaces', 'TemplatePage.rbxui.json'),
    join(project, 'interfaces', 'Templates', 'TemplatePage.rbxui.json'),
    join(project, 'interfaces', 'Templates', '按钮', 'CloseButton.RBXUI.JSON'),
  ];
  for (const path of paths) await writeDocument(path, document);
  await writeFile(join(project, 'interfaces', 'Templates', '说明.txt'), '说明');
  const outside = join(project, 'outside');
  await writeDocument(join(outside, '外部.rbxui.json'), document);
  // Windows junctions do not require symbolic-link privileges.
  const link = join(project, 'interfaces', '外部链接');
  await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  const assets = await listDocumentAssets(project);
  assert.equal(assets.length, 3);
  assert.deepEqual(new Set(assets.map(asset => asset.path)), new Set(paths));
  assert.equal(assets.filter(asset => asset.name === 'TemplatePage').length, 2);
  for (const path of paths) assert.deepEqual(await openDocumentAsset(project, path), { path, document });
  await assert.rejects(openDocumentAsset(project, join(link, '外部.rbxui.json')), /当前工程/);
  await assert.rejects(openDocumentAsset(project, join(project, 'interfaces', 'Templates')), /当前工程/);
});

test('无效输入或写入失败不破坏已有文件；坏文件拒绝读取', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ui-invalid-'));
  const path = join(directory, 'reward.rbxui.json');
  const document = robloxStrategy.createDocument();
  await writeDocument(path, document);
  const content = await readFile(path, 'utf8');
  await assert.rejects(writeDocument(path, { ...document, version: 4 }));
  assert.equal(await readFile(path, 'utf8'), content);
  const blocked = join(directory, 'blocked.rbxui.json'); await mkdir(blocked);
  await assert.rejects(writeDocument(blocked, document));
  assert.equal((await readdir(directory)).some(name => name.endsWith('.tmp')), false);
  await writeFile(path, '{bad'); await assert.rejects(readDocument(path), /JSON/);
});

test('模板参考保存于工程目录，与项目UI隔离且校验资产路径', async () => {
  const project = await mkdtemp(join(tmpdir(), 'ui-template-library-'));
  assert.deepEqual(await listDocumentAssets(project, 'templates'), []);
  const document = robloxStrategy.createDocument('TemplateDemo');
  const path = join(project, 'template-references', '分类', 'TemplateDemo.rbxui.json');
  await writeDocument(path, document);
  const projectFile = join(project, 'interfaces', 'ProjectOnly.rbxui.json');
  await writeDocument(projectFile, document);
  assert.deepEqual(await listDocumentAssets(project, 'templates'), [{ name: 'TemplateDemo', path }]);
  assert.deepEqual(await openDocumentAsset(project, path, 'templates'), { path, document });
  await assert.rejects(openDocumentAsset(project, projectFile, 'templates'), /模板参考库/);
  await assert.rejects(openDocumentAsset(project, path), /当前工程/);
  await assert.rejects(openDocumentAsset(project, join(project, 'template-references', '分类'), 'templates'), /模板参考库/);
  const link = join(project, 'template-references', '链接');
  await symlink(join(project, 'interfaces'), link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await listDocumentAssets(project, 'templates')).length, 1);
  await writeFile(path, '{bad');
  await assert.rejects(openDocumentAsset(project, path, 'templates'), /JSON/);
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

test('UI在三个库之间移动，保留原始字节，拒绝同名覆盖与工程外来源', async () => {
  const project = await mkdtemp(join(tmpdir(), 'ui-move-project-'));
  const runtime = await mkdtemp(join(tmpdir(), 'ui-move-runtime-'));
  const document = robloxStrategy.createDocument('MoveDemo');
  const source = join(project, 'interfaces', '子目录', 'MoveDemo.rbxui.json');
  await writeDocument(source, document);
  const content = await readFile(source, 'utf8');
  const permanent = await moveDocumentAsset(project, source, 'project', runtime, 'permanent');
  assert.equal(permanent.path, join(runtime, 'ui-assets', 'MoveDemo.rbxui.json'));
  assert.equal(await readFile(permanent.path, 'utf8'), content);
  await assert.rejects(readFile(source), { code: 'ENOENT' });
  assert.deepEqual(await listDocumentAssets(runtime, 'permanent'), [permanent]);
  assert.deepEqual(await openDocumentAsset(runtime, permanent.path, 'permanent'), { path: permanent.path, document });
  await assert.rejects(moveDocumentAsset(runtime, permanent.path, 'permanent', runtime, 'permanent'), /其他资产文件夹/);

  const template = await moveDocumentAsset(runtime, permanent.path, 'permanent', project, 'templates');
  assert.equal(template.path, join(project, 'template-references', 'MoveDemo.rbxui.json'));
  assert.equal(await readFile(template.path, 'utf8'), content);
  await assert.rejects(readFile(permanent.path), { code: 'ENOENT' });
  const target = join(project, 'interfaces', 'MoveDemo.rbxui.json');
  const other = robloxStrategy.createDocument('OtherUI');
  await writeDocument(target, other);
  await assert.rejects(moveDocumentAsset(project, template.path, 'templates', project, 'project'), /同名UI/);
  assert.equal(await readFile(template.path, 'utf8'), content);
  assert.deepEqual(await readDocument(target), other);

  const emptyProject = await mkdtemp(join(tmpdir(), 'ui-move-empty-'));
  const moved = await moveDocumentAsset(project, template.path, 'templates', emptyProject, 'project');
  assert.equal(await readFile(moved.path, 'utf8'), content);
  await assert.rejects(readFile(template.path), { code: 'ENOENT' });
  const outside = join(project, 'outside.rbxui.json');
  await writeDocument(outside, document);
  await assert.rejects(moveDocumentAsset(project, outside, 'project', runtime, 'permanent'), /当前工程/);
  assert.deepEqual(await readDocument(outside), document);
  await assert.rejects(moveDocumentAsset(project, join(project, 'interfaces', '子目录'), 'project', runtime, 'permanent'), /当前工程/);
});
