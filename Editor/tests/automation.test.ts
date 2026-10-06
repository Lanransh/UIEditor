import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { mkdtemp, mkdir, writeFile, readFile, symlink } from 'node:fs/promises';
import { robloxStrategy } from '../src/editor/roblox';
import { executeCode, robloxCodeAdapter } from '../electron/code-executor';
import { getNode, findNodes } from '../src/shared/automation';
import { CommandHistory } from '../src/history/CommandHistory';
import { documentCommand } from '../src/editor/commands';
import { interfacePath, saveInterface, openInterface } from '../electron/automation-files';
import { updateManagedServer, createCodexMcpSettingsStore } from '../electron/codex-mcp-settings.cjs';
import { definitions, callTool } from '../mcp/server';
import { startBridge } from '../electron/automation-bridge';
import { getCapabilities } from '../src/editor/automationCapabilities';

const directory = resolve('native-bin');
test('authoring embeds and clears preview images with tiled properties; invalid images roll back', async () => {
  const before = robloxStrategy.createDocument('Stud');
  const preview = { name: 'StudTile.png', dataUrl: 'data:image/png;base64,aGVsbG8=' };
  const result = await executeCode(robloxCodeAdapter, directory, before, 'luau', `
local image = ui.nodes.create("ImageLabel", {name="StudTextureImg", previewImage={name="${preview.name}",dataUrl="${preview.dataUrl}"}, properties={ScaleType=Enum.ScaleType.Tile,TileSize=UDim2.fromOffset(27,27)}})
assert(ui.nodes.get(image.id).previewImage.name == "StudTile.png")
local copy = ui.nodes.duplicate(image.id)
ui.nodes.setPreviewImage(copy.id, nil)
`);
  assert.deepEqual(result.document.root.children[0].previewImage, preview);
  assert.deepEqual(result.document.root.children[0].properties.TileSize, { x: { scale: 0, offset: 27 }, y: { scale: 0, offset: 27 } });
  assert.equal(result.document.root.children[1].previewImage, undefined);
  const history = new CommandHistory<typeof before>();
  const after = history.execute(documentCommand('Stud', () => result.document, robloxStrategy), before);
  assert.deepEqual(history.undo(after), before);
  assert.deepEqual(history.redo(before), after);
  for (const source of [
    'local n=ui.nodes.create("Frame");ui.nodes.setPreviewImage(n.id,{name="a",dataUrl="data:image/png;base64,YQ=="})',
    'local n=ui.nodes.create("ImageLabel");ui.nodes.setPreviewImage(n.id,{name="a",dataUrl="https://example.com/a.png"})',
    'local n=ui.nodes.create("ImageLabel");ui.nodes.setPreviewImage(n.id,{name="a",dataUrl="data:image/png;base64,YQ==",extra=true})',
  ]) await assert.rejects(executeCode(robloxCodeAdapter, directory, before, 'luau', source));
  assert.equal(before.root.children.length, 0);
});
test('authoring creates nodes and source in one undoable snapshot; values and IDs survive redo', async () => {
  const before = robloxStrategy.createDocument('Test');
  const result = await executeCode(robloxCodeAdapter, directory, before, 'luau', `
local panel = ui.nodes.create("Frame", { name = "Panel" })
local button = ui.nodes.create("TextButton", { parentId = panel.id, name = "ClaimButton" })
ui.nodes.setProperties(button.id, { Position = UDim2.fromScale(0.5, 0.5), TextColor3 = Color3.fromRGB(255, 0, 0), Font = Enum.Font.Gotham })
ui.scripts.set("source", "-- changed source")
print(button.id)
`);
  assert.equal(before.root.children.length, 0);
  assert.equal(result.document.root.children[0].children[0].properties.TextColor3, '#ff0000');
  assert.equal(result.document.scripts.source, '-- changed source');
  const history = new CommandHistory<typeof before>();
  const after = history.execute(documentCommand('AI', () => result.document, robloxStrategy), before);
  assert.deepEqual(history.undo(after), before);
  assert.deepEqual(history.redo(before), after);
  assert.equal(result.logs.length, 1);
});
test('authoring rejects invalid properties, hierarchy cycles, wrong values, unsupported language and runaway code', async () => {
  const document = robloxStrategy.createDocument(); const saved = JSON.stringify(document);
  for (const source of [
    'ui.nodes.create("Missing")',
    'ui.nodes.setProperties(ui.root.id, {Unsupported = 1})',
    'local a = ui.nodes.create("Frame"); ui.nodes.setProperties(a.id,{Size = -1})',
    'local a = ui.nodes.create("Frame"); ui.nodes.reparent(a.id, a.id)',
    'local a = ui.nodes.create("Frame"); ui.nodes.setProperties(a.id,{Size = Vector2.new(1,2)})',
    'while true do end',
  ]) await assert.rejects(executeCode(robloxCodeAdapter, directory, document, 'luau', source));
  await assert.rejects(executeCode(robloxCodeAdapter, directory, document, 'lua51', ''), /luau/);
  assert.equal(JSON.stringify(document), saved);
});
test('query and code lookup use intersection, parent scope, pagination and stable IDs', async () => {
  const document = (await executeCode(robloxCodeAdapter, directory, robloxStrategy.createDocument(), 'luau', `
local panel = ui.nodes.create("Frame",{name="Panel"})
for i = 1, 3 do ui.nodes.create("TextButton",{parentId=panel.id,name="Button"}) end
assert(ui.nodes.find({name="Button",limit=2}).total == 3)
assert(#ui.nodes.find({name="Button",limit=2}).nodes == 2)
assert(ui.nodes.find({name="Button",recursive=false}).total == 0)
`)).document;
  const panel = document.root.children[0];
  const result = findNodes(document, { name: 'Button', className: 'TextButton', parentId: panel.id, recursive: false, limit: 2 });
  assert.equal(result.total, 3); assert.equal(result.nextOffset, 2);
  assert.equal(findNodes(document, { name: 'But', match: 'contains' }).total, 3);
  assert.equal(findNodes(document, { name: 'But' }).total, 0);
  assert.equal(findNodes(document, { name: 'Button', className: 'Frame' }).total, 0);
  assert.equal(findNodes(document, { parentId: panel.id, offset: 2 }).nodes.length, 1);
  assert.throws(() => findNodes(document, { limit: 201 }));
  assert.throws(() => getNode(document, { id: 'missing' }));
  assert.equal((getNode(document, { id: panel.children[0].id }) as any).parentId, panel.id);
});
test('generic executor routes another adapter and rejects mismatched language before execution', async () => {
  let calls = 0;
  const adapter = { ...robloxCodeAdapter, language: 'lua51', version: '5.1', execute: async (_dir: string, document: ReturnType<typeof robloxStrategy.createDocument>) => { ++calls; return { document, logs: [], operationCount: 0 }; } };
  await executeCode(adapter, directory, robloxStrategy.createDocument(), 'lua51', '');
  await assert.rejects(executeCode(adapter, directory, robloxStrategy.createDocument(), 'luau', ''));
  assert.equal(calls, 1);
  const strategy = { ...robloxStrategy, automation: { ...robloxStrategy.automation, authoring: { ...robloxStrategy.automation.authoring, language: 'lua51', version: '5.1' } }, mode: robloxStrategy.mode, nodes: robloxStrategy.nodes, createNode: robloxStrategy.createNode.bind(robloxStrategy), createDocument: robloxStrategy.createDocument.bind(robloxStrategy), canParent: robloxStrategy.canParent.bind(robloxStrategy), validate: robloxStrategy.validate.bind(robloxStrategy), layout: robloxStrategy.layout.bind(robloxStrategy) };
  assert.equal(getCapabilities(strategy).authoring.language, 'lua51');
});
test('project files reject traversal, existing destinations and junction escape', async () => {
  await mkdir(resolve('test-results'), { recursive: true });
  const root = await mkdtemp(resolve('test-results/automation-files-'));
  const document = robloxStrategy.createDocument();
  const result = await saveInterface(root, 'reward.rbxui.json', document, true);
  assert.deepEqual((await openInterface(root, 'reward.rbxui.json')).document, document);
  await assert.rejects(saveInterface(root, 'reward.rbxui.json', document, true), /EEXIST/);
  for (const target of ['../escape.rbxui.json', 'C:/escape.rbxui.json', 'foo.txt', './a.rbxui.json']) await assert.rejects(interfacePath(root, target));
  const outside = await mkdtemp(resolve('test-results/automation-outside-'));
  await symlink(outside, join(root, 'interfaces/link'), 'junction');
  await assert.rejects(interfacePath(root, 'link/escape.rbxui.json'), /符号链接/);
  assert.equal(JSON.parse(await readFile(result.path, 'utf8')).version, 3);
});
test('Codex settings preserve unrelated entries and invalid TOML is never modified', async () => {
  const original = '# keep comment\nmodel = "test"\n[mcp_servers.other]\ncommand = "other"\n';
  const output = updateManagedServer(original, { serverPath: resolve('mcp-dist/server.mjs'), discoveryPath: resolve('test-results/bridge.json'), enabled: true });
  assert.ok(output.startsWith(original.trimEnd())); assert.match(output, /mcp_servers.ui-editor/); assert.match(output, /--discovery/);
  await mkdir(resolve('test-results'), { recursive: true });
  const root = await mkdtemp(resolve('test-results/settings-')), filePath = join(root, 'config.toml');
  await writeFile(filePath, 'bad = [');
  const settings = createCodexMcpSettingsStore({ filePath, serverPath: resolve('mcp-dist/server.mjs'), discoveryPath: join(root, 'bridge.json') });
  await assert.rejects(settings.setEnabled(true), /TOML/); assert.equal(await readFile(filePath, 'utf8'), 'bad = [');
});
test('MCP directory is static and bridge authenticates forwarding and screenshots', async () => {
  assert.equal(definitions.length, 15); assert.ok(!definitions.some(tool => tool.name.includes('selection')));
  assert.ok(definitions.some(tool => tool.name === 'uie.scripts.get'));
  assert.ok(definitions.some(tool => tool.name === 'uie.scripts.set'));
  assert.ok(!definitions.some(tool => tool.name.startsWith('uie.history.')));
  const root = await mkdtemp(resolve('test-results/bridge-')), discovery = join(root, 'bridge.json');
  const bridge = await startBridge(discovery, async request => request.name === 'uie.debug.screenshot' ? { png: 'test', metadata: { width: 1 } } : { name: request.name });
  try {
    assert.match((await callTool('uie.editor.get_state', {}, discovery)).content[0].text!, /get_state/);
    assert.equal((await callTool('uie.debug.screenshot', {}, discovery)).content[0].type, 'image');
    const info = JSON.parse(await readFile(discovery, 'utf8'));
    assert.equal((await fetch(`http://127.0.0.1:${info.port}/call`, { method: 'POST' })).status, 403);
  } finally { bridge.close(); }
});
