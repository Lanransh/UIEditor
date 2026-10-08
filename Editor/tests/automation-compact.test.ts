import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCapabilities } from '../src/editor/automationCapabilities';
import { robloxStrategy } from '../src/editor/roblox';
import { getNode, findNodes } from '../src/shared/automation';
import { validateTool } from '../src/shared/automation-tools';

const size = (value: unknown) => JSON.stringify(value).length;

test('capability summary and type lookup preserve the full contract and reduce output', () => {
  const full = getCapabilities(robloxStrategy);
  assert.ok("nodes" in full);
  assert.deepEqual(full.nodes, robloxStrategy.nodes);
  assert.deepEqual(getCapabilities(robloxStrategy, { detail: 'full' }), full);
  const summary = getCapabilities(robloxStrategy, { detail: 'summary' });
  assert.ok("nodeTypes" in summary);
  assert.deepEqual(summary.nodeTypes, Object.keys(robloxStrategy.nodes));
  assert.equal("nodes" in summary, false);
  assert.deepEqual(summary.authoring, full.authoring);
  assert.deepEqual(summary.runtime, full.runtime);
  assert.ok(size(summary) < size(full) * 0.25);
  for (const className of summary.nodeTypes!) {
    const selected = getCapabilities(robloxStrategy, { className });
    assert.ok("nodes" in selected);
    assert.deepEqual(selected.nodes, { [className]: full.nodes![className] });
    assert.deepEqual(selected.parenting, { [className]: full.parenting![className] });
  }
  assert.throws(() => getCapabilities(robloxStrategy, { className: 'Missing' }), /节点类型/);
});

test('compact node queries preserve properties, identity, pagination and truncation', () => {
  const document = robloxStrategy.createDocument('LongDocumentName');
  const parent = robloxStrategy.createNode('Frame');
  parent.children.push(robloxStrategy.createNode('TextLabel'), robloxStrategy.createNode('ImageLabel'));
  document.root.children.push(parent);
  const full: any = getNode(document, { id: parent.id });
  assert.ok(full.path);
  assert.deepEqual(getNode(document, { id: parent.id, compact: false }), full);
  const compact: any = getNode(document, { id: parent.id, compact: true });
  assert.equal(compact.id, full.id);
  assert.deepEqual(compact.properties, full.properties);
  assert.equal(compact.path, undefined);
  assert.deepEqual(compact.children, parent.children.map(({ id, name, className }) => ({ id, name, className })));
  assert.ok(size(compact) < size(full));
  const limited: any = getNode(document, { id: parent.id, compact: true, depth: 1, maxNodes: 2 });
  assert.equal(limited.truncated, true);
  assert.equal(limited.omittedChildren, 1);
  assert.deepEqual(limited.children[0].properties, parent.children[0].properties);
  const page = findNodes(document, { parentId: parent.id, compact: true, limit: 1 });
  assert.equal(page.total, 2);
  assert.equal(page.nextOffset, 1);
  assert.deepEqual(page.nodes[0], compact.children[0]);
  assert.deepEqual(findNodes(document, { parentId: parent.id, compact: true, offset: 1 }).nodes[0], compact.children[1]);
});

test('new options are optional, typed and limited to relevant tools', () => {
  validateTool('uie.editor.get_capabilities', {});
  validateTool('uie.editor.get_capabilities', { detail: 'summary', className: 'Frame' });
  assert.throws(() => validateTool('uie.editor.get_capabilities', { className: [] }));
  assert.throws(() => validateTool('uie.editor.get_capabilities', { detail: 'other' }));
  for (const name of ['uie.nodes.get', 'uie.nodes.find', 'uie.runtime.batch']) {
    const args = name.endsWith('batch') ? { sessionId: 'session', revision: 1, steps: [{ action: 'run' }] } : {};
    validateTool(name, { ...args, compact: true });
    assert.throws(() => validateTool(name, { ...args, compact: 'true' }));
  }
  assert.throws(() => validateTool('uie.scripts.get', { compact: true }));
});
