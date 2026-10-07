import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, rename, readdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createProject, openProject, RecentProjects, validateManifest } from '../electron/projects';
import { listDocumentAssets, readDocument, writeDocument } from '../electron/documents';
import { robloxStrategy } from '../src/editor/roblox';

async function fixture(t: TestContext) {
  const base = join(process.cwd(), 'test-results');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'projects-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('新工程仅克隆模板参考，保留子文件夹、同名文件和完整快照，副本相互独立', async t => {
  const root = await fixture(t);
  const source = (await createProject(root)).project;
  const document = robloxStrategy.createDocument('Reward');
  await writeDocument(join(source.path, 'template-references', 'Reward.rbxui.json'), document);
  await writeDocument(join(source.path, 'template-references', '中文 分类', 'Reward.rbxui.json'), document);
  await writeDocument(join(source.path, 'interfaces', 'ProjectOnly.rbxui.json'), document);
  await mkdir(join(source.path, 'image-assets'));
  await writeFile(join(source.path, 'image-assets', 'keep.txt'), 'project image');
  await writeFile(join(source.path, 'template-references', 'ignored.txt'), 'not a template');
  const parent = join(root, '新工程');
  await mkdir(parent);
  const target = (await createProject(parent, source.path)).project;
  assert.notEqual(target.manifest.id, source.manifest.id);
  assert.deepEqual((await readdir(target.path)).sort(), ['project.json', 'template-references']);
  assert.equal((await listDocumentAssets(target.path, 'templates')).length, 2);
  const copy = join(target.path, 'template-references', '中文 分类', 'Reward.rbxui.json');
  assert.deepEqual(await readDocument(copy), document);
  await writeDocument(copy, robloxStrategy.createDocument('Changed'));
  assert.deepEqual(await readDocument(join(source.path, 'template-references', '中文 分类', 'Reward.rbxui.json')), document);
  assert.deepEqual(await readDocument(join(target.path, 'template-references', 'Reward.rbxui.json')), document);
});

test('不克隆或来源没有模板时创建空工程', async t => {
  const root = await fixture(t);
  const source = (await createProject(root)).project;
  for (const templateSource of [undefined, source.path]) {
    const parent = join(root, templateSource ? 'empty-source' : 'no-clone');
    await mkdir(parent);
    const target = (await createProject(parent, templateSource)).project;
    assert.deepEqual(await readdir(target.path), ['project.json']);
  }
});

test('来源无效或模板损坏时创建失败，不留下工程或改变来源文件', async t => {
  const root = await fixture(t);
  const source = (await createProject(root)).project;
  await writeDocument(join(source.path, 'template-references', 'Good.rbxui.json'), robloxStrategy.createDocument('Good'));
  const broken = join(source.path, 'template-references', 'Broken.rbxui.json');
  await writeFile(broken, '{bad');
  const parent = join(root, 'target');
  await mkdir(parent);
  await assert.rejects(createProject(parent, source.path), /JSON/);
  assert.deepEqual(await readdir(parent), []);
  assert.equal(await readFile(broken, 'utf8'), '{bad');
  await assert.rejects(createProject(parent, join(root, 'missing', 'UIEditorWorkspace')));
  assert.deepEqual(await readdir(parent), []);
});

test('目标已存在时不克隆模板、不改动目标，也不读取失效来源', async t => {
  const root = await fixture(t);
  const target = (await createProject(root)).project;
  const file = join(target.path, 'template-references', 'Keep.rbxui.json');
  const document = robloxStrategy.createDocument('Keep');
  await writeDocument(file, document);
  const result = await createProject(root, join(root, 'missing', 'UIEditorWorkspace'));
  assert.equal(result.kind, 'existing');
  assert.deepEqual(result.project, target);
  assert.deepEqual(await readDocument(file), document);
});

test('克隆不跟随模板子目录链接，拒绝链接形式的模板根目录', async t => {
  const root = await fixture(t);
  const source = (await createProject(root)).project;
  const outside = join(root, 'outside');
  await writeDocument(join(outside, 'External.rbxui.json'), robloxStrategy.createDocument('External'));
  const templates = join(source.path, 'template-references');
  await mkdir(templates);
  await symlink(outside, join(templates, 'linked'), 'junction');
  const parent = join(root, 'target');
  await mkdir(parent);
  const target = (await createProject(parent, source.path)).project;
  assert.deepEqual(await listDocumentAssets(target.path, 'templates'), []);
  await rm(templates, { recursive: true });
  await symlink(outside, templates, 'junction');
  const rejected = join(root, 'rejected');
  await mkdir(rejected);
  await assert.rejects(createProject(rejected, source.path), /模板参考目录无效/);
  assert.deepEqual(await readdir(rejected), []);
});

test('中文与空格路径：创建、重读、重复创建、移动后打开保持身份', async t => {
  const root = await fixture(t);
  const parent = join(root, '中文 游戏');
  await mkdir(parent);
  const created = await createProject(parent);
  assert.equal(created.kind, 'created');
  assert.equal(created.project.name, '中文 游戏');
  assert.deepEqual(await openProject(created.project.path), created.project);
  const file = join(created.project.path, 'project.json');
  const original = await readFile(file, 'utf8');
  assert.equal((await createProject(parent)).kind, 'existing');
  assert.equal(await readFile(file, 'utf8'), original);
  const moved = join(root, '新位置');
  await rename(parent, moved);
  const reopened = await openProject(join(moved, 'UIEditorWorkspace'));
  assert.deepEqual(reopened.manifest, created.project.manifest);
  assert.equal(reopened.name, '新位置');
});

test('已有空目录、非工程目录和同名文件均不被覆盖', async t => {
  const root = await fixture(t);
  const path = join(root, 'UIEditorWorkspace');
  await mkdir(path);
  await assert.rejects(createProject(root), /已存在/);
  await writeFile(join(path, 'keep.txt'), 'keep');
  await writeFile(join(path, 'project.json'), '{bad');
  await assert.rejects(createProject(root), /已存在/);
  assert.equal(await readFile(join(path, 'keep.txt'), 'utf8'), 'keep');
  assert.equal(await readFile(join(path, 'project.json'), 'utf8'), '{bad');
  await rm(path, { recursive: true });
  await writeFile(path, 'keep');
  await assert.rejects(createProject(root), /已存在/);
  assert.equal(await readFile(path, 'utf8'), 'keep');
});

test('损坏文件、错误版本、非 Roblox 模式和无效身份被拒绝', async t => {
  const root = await fixture(t);
  const { project } = await createProject(root);
  const file = join(project.path, 'project.json');
  await writeFile(file, '{bad');
  await assert.rejects(openProject(project.path), /损坏/);
  for (const [override, message] of [
    [{ version: 2 }, /版本/], [{ mode: 'mini' }, /模式/], [{ id: '' }, /ID/], [{ createdAt: 'invalid' }, /时间/],
  ] as const) {
    await writeFile(file, JSON.stringify({ ...project.manifest, ...override }));
    await assert.rejects(openProject(project.path), message);
  }
  assert.throws(() => validateManifest(null), /结构/);
  await assert.rejects(openProject(root), /请选择/);
});

test('历史持久化、排序去重、移除不删除工程、拒绝未知路径', async t => {
  const root = await fixture(t);
  const store = new RecentProjects(join(root, 'runtime'));
  assert.deepEqual(await store.list(), []);
  const a = (await createProject(root)).project;
  const second = join(root, 'second');
  await mkdir(second);
  const b = (await createProject(second)).project;
  await store.record(a.path);
  await store.record(b.path);
  await store.record(process.platform === 'win32' ? a.path.toUpperCase() : a.path);
  const loaded = new RecentProjects(join(root, 'runtime'));
  const history = await loaded.list();
  assert.equal(history.length, 2);
  assert.equal(history[0].path.toLowerCase(), a.path.toLowerCase());
  assert.equal(history[1].path, b.path);
  await assert.rejects(store.resolveRecent(join(root, 'unknown')), /找不到/);
  await store.remove(a.path);
  assert.equal((await store.list()).length, 1);
  assert.deepEqual((await openProject(a.path)).manifest, a.manifest);
});

test('历史损坏不会被静默覆盖', async t => {
  const root = await fixture(t);
  const file = join(root, 'recent-projects.json');
  await writeFile(file, 'broken');
  const store = new RecentProjects(root);
  await assert.rejects(store.record(root), /损坏/);
  assert.equal(await readFile(file, 'utf8'), 'broken');
});
