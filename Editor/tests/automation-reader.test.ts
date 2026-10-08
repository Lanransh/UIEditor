import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rename, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { AutomationReader } from '../electron/automation-reader';
import { RecentProjects, createProject } from '../electron/projects';
import { writeDocument } from '../electron/documents';
import { robloxStrategy } from '../src/editor/roblox';
import { getNode, nodeTree } from '../src/shared/automation';
import { validateTool } from '../src/shared/automation-tools';
import { ImageAssetStore } from '../electron/image-assets';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'uie-reader-'));
  const runtime = join(root, 'runtime'), recent = new RecentProjects(runtime);
  const a = join(root, 'first'), b = join(root, 'second');
  await mkdir(a); await mkdir(b);
  const first = (await createProject(a)).project, second = (await createProject(b)).project;
  await recent.record(first.path); await recent.record(second.path);
  const document = robloxStrategy.createDocument('Reward');
  document.root.children.push(robloxStrategy.createNode('Frame'));
  const reader = new AutomationReader(runtime, recent, () => first);
  return { root, runtime, recent, first, second, document, reader };
}

test('UUID reads default to current project, support other projects/global library and survive file rename', async () => {
  const f = await fixture();
  try {
    const path = join(f.first.path, 'AgentWorkspace', 'styles', 'templates', '奖励', 'Reward.rbxui.json');
    await writeDocument(path, f.document);
    await writeDocument(join(f.second.path, 'interfaces', 'Reward.rbxui.json'), { ...f.document, name: 'Other' });
    await writeDocument(join(f.runtime, 'ui-assets', 'Reward.rbxui.json'), f.document);
    const listing = await f.reader.listDocuments({ library: 'templates', limit: 1 });
    assert.equal(listing.interfaces[0].documentId, f.document.id);
    assert.equal(listing.interfaces[0].relativePath, '奖励/Reward.rbxui.json');
    assert.equal((await f.reader.read({ library: 'templates', documentId: f.document.id })).document.name, 'Reward');
    assert.equal((await f.reader.read({ projectId: f.second.manifest.id.toUpperCase(), documentId: f.document.id })).document.name, 'Other');
    await rename(path, join(f.first.path, 'AgentWorkspace', 'styles', 'templates', '奖励', 'Renamed.rbxui.json'));
    assert.equal((await f.reader.read({ library: 'templates', documentId: f.document.id })).document.id, f.document.id);
    const hub = new AutomationReader(f.runtime, f.recent, () => null);
    await assert.rejects(hub.listDocuments({}), /打开工程/);
    assert.equal((await hub.read({ library: 'permanent', documentId: f.document.id })).document.id, f.document.id);
    assert.equal((await hub.read({ projectId: f.second.manifest.id, documentId: f.document.id })).document.name, 'Other');
    assert.equal((await hub.listProjects()).projects.length, 2);
    await assert.rejects(f.reader.project(randomUUID()), /找不到/);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('lists isolate broken files and reject ambiguous document/project UUIDs and linked libraries', async () => {
  const f = await fixture();
  try {
    const library = join(f.first.path, 'AgentWorkspace', 'styles', 'templates');
    await writeDocument(join(library, 'A.rbxui.json'), f.document);
    await writeDocument(join(library, 'B.rbxui.json'), f.document);
    await writeFile(join(library, 'Broken.rbxui.json'), '{bad');
    const listing = await f.reader.listDocuments({ library: 'templates', offset: 1, limit: 1 });
    assert.equal(listing.total, 3); assert.equal(listing.nextOffset, 2);
    assert.match(listing.interfaces[0].problem!, /UUID 重复/);
    await assert.rejects(f.reader.read({ library: 'templates', documentId: f.document.id }), /UUID 重复/);
    await writeFile(join(f.second.path, 'project.json'), JSON.stringify(f.first.manifest));
    assert.ok((await f.reader.listProjects()).projects.every(project => !!project.problem));
    await assert.rejects(f.reader.project(f.first.manifest.id), /UUID 重复/);
    // A known current project is still selected by its active location when UUID is omitted.
    assert.equal((await f.reader.project()).path, f.first.path);
    const outside = join(f.root, 'outside'); await mkdir(outside);
    await rm(library, { recursive: true }); await symlink(outside, library, 'junction');
    await assert.rejects(f.reader.listDocuments({ library: 'templates' }), /符号链接/);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('saved nodes resolve images from the source project, and global reads work without a project', async () => {
  const f = await fixture();
  try {
    const store = new ImageAssetStore(f.runtime, f.second.path);
    const asset = await store.import('project', { name: 'tile.png', dataUrl: 'data:image/png;base64,YQ==' });
    await store.update({ id: asset.id, name: asset.name, tags: '', robloxId: '123456' });
    const image = robloxStrategy.createNode('ImageLabel'); image.imageAssetId = asset.id;
    f.document.root.children.push(image);
    await writeDocument(join(f.second.path, 'AgentWorkspace', 'styles', 'templates', 'Reward.rbxui.json'), f.document);
    const saved = await f.reader.read({ projectId: f.second.manifest.id, library: 'templates', documentId: f.document.id });
    assert.equal(saved.document.root.children[1].properties.Image, 'rbxassetid://123456');
    assert.equal((await f.reader.images({ projectId: f.second.manifest.id, library: 'project' })).assets[0].id, asset.id);
    const hub = new AutomationReader(f.runtime, f.recent, () => null);
    assert.ok((await hub.images({ library: 'permanent' })).assets.length > 0);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('tree and JSON queries bound wide output and tree reports depth truncation without properties', () => {
  const document = robloxStrategy.createDocument('Wide');
  for (let i = 0; i < 10; ++i) {
    const panel = robloxStrategy.createNode('Frame'); panel.name = `Panel${i}`;
    panel.children.push(robloxStrategy.createNode('TextButton')); document.root.children.push(panel);
  }
  const tree = nodeTree(document, { depth: 1, maxNodes: 3 });
  assert.equal(tree.nodeCount, 3); assert.deepEqual(tree.truncationReasons, ['depth', 'maxNodes']);
  assert.match(tree.tree, /├── Panel0/); assert.doesNotMatch(tree.tree, /BackgroundColor3|TextButton/);
  assert.equal(nodeTree(document, { depth: 2 }).truncated, false);
  const json = getNode(document, { depth: 2, maxNodes: 3 }) as any;
  assert.equal(json.children.length, 1); assert.equal(json.omittedChildren, 9);
  assert.equal(document.root.children.length, 10);
});

test('target schema rejects paths, invalid UUIDs, runtime files and write-tool targets', () => {
  const documentId = randomUUID(), projectId = randomUUID();
  validateTool('uie.nodes.get', { target: { documentId, library: 'templates' }, format: 'tree' });
  for (const args of [
    { target: { documentId: 'bad' } }, { target: { documentId, path: 'C:/any' } },
    { target: { documentId, library: 'permanent', projectId } }, { target: { documentId }, view: 'runtime' },
    { target: [] }, { maxNodes: 0 }, { format: 'xml' },
  ]) assert.throws(() => validateTool('uie.nodes.get', args));
  assert.throws(() => validateTool('uie.scripts.set', { sessionId: 'x', revision: 0, source: '', target: { documentId } }));
  assert.throws(() => validateTool('uie.document.list', { projectId: 'bad' }));
});
