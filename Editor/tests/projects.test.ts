import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createProject, openProject, RecentProjects, validateManifest } from '../electron/projects';

async function fixture(t: TestContext) {
  const base = join(process.cwd(), 'test-results');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'projects-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

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
