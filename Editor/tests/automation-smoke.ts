import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { rewardExample } from '../src/editor/scriptExample';

await mkdir(resolve('test-results'), { recursive: true });
const root = await mkdtemp(resolve('test-results/mcp-smoke-'));
const runtime = join(root, 'runtime'), discovery = join(runtime, 'ui-editor-automation.json');
const packaged = process.argv.includes('--packaged');
const packagedExecutable = process.env.UI_EDITOR_PACKAGED_EXECUTABLE || resolve('../ToolRuntime/UIEditor-win32-x64/UIEditor.exe');
const serverPath = packaged ? resolve(packagedExecutable, '../resources/mcp-dist/server.mjs') : resolve('mcp-dist/server.mjs');
const mcp = spawn(process.execPath, [serverPath, '--stdio', '--discovery', discovery], { windowsHide: true, stdio: 'pipe' });
let id = 0;
const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
const lines = createInterface({ input: mcp.stdout });
lines.on('line', line => { const message = JSON.parse(line); const item = pending.get(message.id); if (!item) return; clearTimeout(item.timer); pending.delete(message.id); if (message.error) item.reject(new Error(JSON.stringify(message.error))); else item.resolve(message.result); });
function rpc(method: string, params: unknown = {}) {
  return new Promise<any>((resolve, reject) => { const requestId = ++id; const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`MCP timeout: ${method}`)); }, 20000); pending.set(requestId, { resolve, reject, timer }); mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }) + '\n'); });
}
async function raw(name: string, args: object = {}) { return rpc('tools/call', { name, arguments: args }); }
async function call(name: string, args: object = {}) {
  const result = await raw(name, args); assert.ok(!result.isError, result.content?.[0]?.text);
  return JSON.parse(result.content[0].text);
}
async function state(detail = 'summary') { return call('uie.editor.get_state', { detail }); }
async function mutate(name: string, args: object = {}) { const s = await state(); return call(name, { sessionId: s.sessionId, revision: s.revision, ...args }); }
const quote = (source: string) => `[==[${source}]==]`;
let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
try {
  assert.equal((await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } })).serverInfo.name, 'ui-editor');
  const listed = (await rpc('tools/list')).tools;
  assert.equal(listed.length, 18); assert.ok(listed.some((tool: any) => tool.name === 'uie.scripts.set')); assert.ok(!listed.some((tool: any) => tool.name.startsWith('uie.history.')));
  assert.equal((await raw('uie.history.undo')).isError, true);
  assert.equal((await raw('uie.editor.get_state')).isError, true);
  const parent = join(root, 'project'); await mkdir(parent);
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), UI_EDITOR_USER_DATA: runtime, CODEX_HOME: join(root, 'codex') }; delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch(packaged ? { executablePath: packagedExecutable, env } : { args: ['.'], env });
  const page = await app.firstWindow(); page.setDefaultTimeout(15000);
  async function uiHistory(action: 'undo' | 'redo') {
    await page.locator('.canvas-viewport').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press(action === 'undo' ? 'Control+z' : 'Control+y');
  }
  if (packaged) {
    const attemptedPackage = spawnSync(process.execPath, ['scripts/package.mjs'], { env: { ...process.env, UI_EDITOR_PACKAGE_OUTPUT: resolve(packagedExecutable, '../..') }, encoding: 'utf8', windowsHide: true, timeout: 15000 });
    assert.equal(attemptedPackage.status, 1); assert.match(attemptedPackage.stderr, /目标 UIEditor 正在运行/);
  }
  if (packaged) await page.context().setOffline(true);
  const pageErrors: string[] = []; page.on('pageerror', error => pageErrors.push(error.message));
  await page.getByRole('heading', { name: '选择工程', exact: true }).waitFor();
  assert.equal((await raw('uie.editor.get_state')).isError, true);
  assert.equal(await page.getByRole('button', { name: '打开 AI 工作区', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '配置 Codex MCP', exact: true }).count(), 0);
  const settings = page.getByRole('button', { name: '设置', exact: true });
  const settingsBounds = await settings.boundingBox(), titleBounds = await page.locator('#hub-title').boundingBox();
  assert.ok(settingsBounds && titleBounds && settingsBounds.x > titleBounds.x + titleBounds.width && settingsBounds.y < titleBounds.y);
  await page.screenshot({ path: join(root, 'hub.png') });
  await settings.click();
  await page.getByRole('button', { name: '启用 MCP', exact: true }).click();
  await page.getByRole('button', { name: '禁用 MCP', exact: true }).waitFor();
  assert.match(await readFile(join(root, 'codex/config.toml'), 'utf8'), /mcp_servers.ui-editor/);
  await page.getByRole('button', { name: '禁用 MCP', exact: true }).click();
  await page.getByRole('button', { name: '启用 MCP', exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await app.evaluate(({ dialog }, parent) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [parent] }); dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); }, parent);
  await page.getByRole('button', { name: '创建工程', exact: true }).click();
  await page.getByRole('button', { name: '运行', exact: true }).waitFor();
  const capability = await call('uie.editor.get_capabilities'); assert.equal(capability.authoring.language, 'luau'); assert.ok(capability.nodes.TextButton);
  const initial = await state('full');
  assert.equal(initial.document, null);
  assert.equal((await state()).nodeCount, 0);
  await mutate('uie.document.new', { name: 'OnlineReward' });
  const blank = await state('full');
  const fixture = rewardExample();
  const build = `
ui.nodes.rename(ui.root.id, ${quote(fixture.root.name)})
for i, spec in ipairs({{"TextLabel","RewardTitle"},{"TextLabel","StatusText"},{"TextButton","ClaimButton"}}) do
    ui.nodes.create(spec[1], {name=spec[2], properties={Position=UDim2.fromOffset(440,80+i*100), Size=UDim2.fromOffset(400,70)}})
end
ui.scripts.set("source", ${quote(fixture.scripts.source)})
ui.scripts.set("integration", ${quote(fixture.scripts.integration)})
print("Created reward UI")`;
  const dry = await mutate('uie.code.execute', { language: 'luau', source: build, dryRun: true }); assert.equal(dry.success, true);
  assert.deepEqual((await state('full')).document, blank.document);
  await mutate('uie.code.execute', { language: 'luau', source: build, label: '制作奖励界面' });
  const created = await state('full'); assert.equal(created.document.root.children.length, 3);
  const stale = await raw('uie.scripts.set', { sessionId: blank.sessionId, revision: blank.revision, source: fixture.scripts.source }); assert.equal(stale.isError, true);
  await uiHistory('undo'); assert.deepEqual((await state('full')).document, blank.document);
  await uiHistory('redo'); assert.deepEqual((await state('full')).document, created.document);
  assert.deepEqual((await call('uie.scripts.get')).scripts, fixture.scripts);
  await mutate('uie.scripts.set', { source: fixture.scripts.source + '\n-- MCP edit' });
  assert.equal((await call('uie.scripts.get', { kind: 'source' })).scripts.source, fixture.scripts.source + '\n-- MCP edit');
  assert.equal((await call('uie.scripts.get', { kind: 'integration' })).scripts.integration, fixture.scripts.integration);
  await uiHistory('undo'); assert.deepEqual((await call('uie.scripts.get')).scripts, fixture.scripts);
  await uiHistory('redo'); assert.match((await call('uie.scripts.get')).scripts.source, /MCP edit/);
  await uiHistory('undo');
  await mutate('uie.scripts.set', { source: fixture.scripts.source + '\n-- combined', integration: fixture.scripts.integration + '\n-- combined' });
  assert.match((await call('uie.scripts.get')).scripts.integration, /combined/);
  await uiHistory('undo'); assert.deepEqual((await call('uie.scripts.get')).scripts, fixture.scripts);
  const beforeEmpty = await state();
  assert.equal((await raw('uie.scripts.set', { sessionId: beforeEmpty.sessionId, revision: beforeEmpty.revision })).isError, true);
  assert.equal((await raw('uie.scripts.set', { sessionId: beforeEmpty.sessionId, revision: beforeEmpty.revision, source: 'x'.repeat(262145) })).isError, true);
  assert.deepEqual((await state('full')).document, created.document);
  const beforeNoOp = await state();
  const noOp = await mutate('uie.code.execute', { language: 'luau', source: 'print("no change")' }); assert.equal(noOp.changed, false); assert.equal(noOp.revision, beforeNoOp.revision);
  const failed = await mutate('uie.code.execute', { language: 'luau', source: 'print("before error"); ui.nodes.create("Missing")' }); assert.equal(failed.success, false); assert.equal(failed.logs.length, 1);
  assert.deepEqual((await state('full')).document, created.document);
  const button = (await call('uie.nodes.find', { name: 'ClaimButton', className: 'TextButton' })).nodes[0];
  assert.ok(button.id); assert.equal((await call('uie.nodes.get', { id: button.id })).node.name, 'ClaimButton');
  await mutate('uie.document.save', { relativePath: 'reward.rbxui.json' }); assert.equal((await state()).dirty, false);
  await uiHistory('undo'); assert.equal((await state()).dirty, true);
  await uiHistory('redo'); assert.equal((await state()).dirty, false);
  // Interleave a real UI edit with MCP history.
  await page.getByLabel('界面名称', { exact: true }).fill('Renamed');
  await page.getByLabel('界面名称', { exact: true }).press('Enter');
  assert.equal((await state('full')).document.name, 'Renamed');
  await uiHistory('undo'); assert.equal((await state('full')).document.name, 'OnlineReward');
  await uiHistory('redo'); assert.equal((await state('full')).document.name, 'Renamed');
  await uiHistory('undo');
  const run = await mutate('uie.runtime.control', { action: 'run' }); assert.equal(run.result.ok, true, JSON.stringify(run.result));
  assert.equal((await call('uie.nodes.get', { id: button.id, view: 'runtime' })).node.properties.Text, 'Ready');
  assert.equal((await raw('uie.scripts.set', { sessionId: run.sessionId, revision: run.revision, source: fixture.scripts.source })).isError, true);
  assert.equal((await mutate('uie.runtime.click', { id: button.id })).dispatched, true);
  assert.equal((await call('uie.nodes.get', { id: button.id, view: 'runtime' })).node.properties.Text, 'Claimed');
  assert.equal((await mutate('uie.runtime.click', { id: button.id })).reason, 'disabled');
  const diagnostics = await call('uie.debug.get_diagnostics'); assert.ok(diagnostics.logs.some((log: any) => log.kind === 'action'));
  assert.equal((await call('uie.debug.get_diagnostics', { cursor: diagnostics.cursor })).logs.length, 0);
  const capture = await raw('uie.debug.screenshot'); assert.equal(capture.content[0].type, 'image');
  await writeFile(join(root, 'reward.png'), Buffer.from(capture.content[0].data, 'base64'));
  await mutate('uie.runtime.control', { action: 'reset' }); assert.equal((await call('uie.nodes.get', { id: button.id, view: 'runtime' })).node.properties.Text, 'Ready');
  await mutate('uie.runtime.control', { action: 'stop' });
  assert.deepEqual((await state('full')).document, created.document);
  for (const status of ['Locked', 'Claimed']) {
    await mutate('uie.scripts.set', { integration: fixture.scripts.integration.replace('Status = "Claimable"', `Status = "${status}"`) });
    assert.equal((await mutate('uie.runtime.control', { action: 'run' })).result.ok, true);
    assert.equal((await mutate('uie.runtime.click', { id: button.id })).reason, 'disabled');
    await mutate('uie.runtime.control', { action: 'stop' }); await uiHistory('undo');
  }
  await mutate('uie.scripts.set', { source: 'invalid syntax !!!' });
  assert.equal((await mutate('uie.runtime.control', { action: 'run' })).result.ok, false);
  assert.ok((await call('uie.debug.get_diagnostics')).logs.some((log: any) => log.kind === 'error'));
  await uiHistory('undo');
  await mutate('uie.document.new', { name: 'Another' });
  await mutate('uie.document.open', { relativePath: 'reward.rbxui.json' });
  assert.deepEqual((await state('full')).document, created.document); assert.equal('history' in (await state()), false);
  assert.equal((await call('uie.document.list')).interfaces.length, 1);
  assert.notEqual(initial.sessionId, (await state()).sessionId);
  assert.deepEqual(pageErrors, []);
  console.log(`MCP ${packaged ? 'packaged' : 'development'} smoke passed: ${root}`);
} finally {
  if (app) await app.close(); lines.close(); mcp.kill(); for (const item of pending.values()) clearTimeout(item.timer);
}
