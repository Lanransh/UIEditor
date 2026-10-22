import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createProject } from '../electron/projects';

await mkdir(resolve('test-results'), { recursive: true });
const root = await mkdtemp(resolve('test-results/project-opening-smoke-'));
const runtime = join(root, 'runtime'), discovery = join(runtime, 'ui-editor-automation.json');
const first = (await createProject(root)).project;
const otherParent = join(root, 'other'); await mkdir(otherParent);
const other = (await createProject(otherParent)).project;
const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), UI_EDITOR_USER_DATA: runtime, UI_EDITOR_BACKGROUND: '1' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.UI_EDITOR_OPEN_WORKSPACE;
const mcp = spawn(process.execPath, [resolve('mcp-dist/server.mjs'), '--discovery', discovery], {
  // Only the final cold-start test uses a real minimized window; all existing-instance checks stay hidden.
  env: { ...env, UI_EDITOR_BACKGROUND: '0' }, stdio: 'pipe', windowsHide: true,
});
const replies = new Map<number, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
let id = 0;
const lines = createInterface({ input: mcp.stdout });
lines.on('line', line => {
  const message = JSON.parse(line), item = replies.get(message.id);
  if (item) { clearTimeout(item.timer); replies.delete(message.id); item.resolve(message.result); }
});
function raw(name: string, args: object = {}) {
  return new Promise<any>((resolve, reject) => {
    const requestId = ++id, timer = setTimeout(() => { replies.delete(requestId); reject(new Error(`Timeout: ${name}`)); }, 75000);
    replies.set(requestId, { resolve, reject, timer });
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, method: 'tools/call', params: { name, arguments: args } }) + '\n');
  });
}
async function call(name: string, args: object = {}) {
  const result = await raw(name, args);
  assert.ok(!result.isError, result.content?.[0]?.text);
  return JSON.parse(result.content[0].text);
}
async function state() { return call('uie.editor.get_state', { detail: 'full' }); }
async function mutate(name: string, args: object) {
  const s = await state(); return call(name, { sessionId: s.sessionId, revision: s.revision, ...args });
}
let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
let coldPid: number | undefined;
let coldStarted = false;
try {
  app = await electron.launch({ args: ['.'], env });
  const page = await app.firstWindow();
  await page.getByRole('heading', { name: '选择工程', exact: true }).waitFor();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => { throw new Error('MCP must not display a confirmation dialog.'); };
  });
  assert.equal((await state()).workspacePath, null);
  assert.equal((await call('uie.project.open', { path: first.path })).workspacePath, first.path);
  await page.getByText('请打开一个工程', { exact: true }).waitFor();
  await mutate('uie.document.new', { name: 'KeepMe' });
  const source = (await state()).document.scripts.source + '\n-- unsaved edits';
  await mutate('uie.scripts.set', { source });
  const dirty = await state();
  assert.equal(dirty.dirty, true);
  const reused = await call('uie.project.open', { path: first.path });
  assert.equal(reused.reused, true);
  assert.deepEqual(await state(), dirty);
  const blocked = await raw('uie.project.open', { path: other.path });
  assert.equal(blocked.isError, true);
  assert.match(blocked.content[0].text, /人工介入/);
  assert.ok(blocked.content[0].text.includes(first.path));
  assert.deepEqual(await state(), dirty);
  assert.equal((await raw('uie.project.open', { path: root })).isError, true);
  assert.deepEqual(await state(), dirty);
  await mutate('uie.document.save', { relativePath: 'KeepMe.json' });
  assert.equal((await mutate('uie.runtime.control', { action: 'run' })).result.ok, true);
  const running = await raw('uie.project.open', { path: other.path });
  assert.equal(running.isError, true); assert.match(running.content[0].text, /人工介入/);
  await mutate('uie.runtime.control', { action: 'stop' });
  const imported = await mutate('uie.assets.import', { library: 'project', filePath: resolve('src/assets/images/Placeholder.png') });
  await page.getByRole('button', { name: '图片资产', exact: true }).click();
  await page.getByRole('button', { name: '项目图片', exact: true }).click();
  await page.getByRole('button', { name: `图片资产 ${imported.asset.name}`, exact: true }).click();
  const assetName = page.getByRole('textbox', { name: '图片资产名称', exact: true });
  await assetName.fill('Unsaved asset metadata');
  const assetBlocked = await raw('uie.project.open', { path: other.path });
  assert.equal(assetBlocked.isError, true); assert.match(assetBlocked.content[0].text, /人工介入/);
  assert.equal(await assetName.inputValue(), 'Unsaved asset metadata');
  await assetName.fill(imported.asset.name);
  const opened = await call('uie.project.open', { path: other.path });
  assert.equal(opened.workspacePath, other.path); assert.equal(opened.reused, false);
  assert.equal((await state()).document, null);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(w => !w.isVisible() && !w.isFocused())), true);
  assert.equal((await call('uie.project.open', { path: first.path })).workspacePath, first.path);
  await mutate('uie.document.open', { relativePath: 'KeepMe/KeepMe.json' });
  assert.equal((await state()).document.scripts.source, source);
  await app.close(); app = undefined;

  // Real cold start through stdio, using the persisted launch configuration, not Playwright.
  coldStarted = true;
  const cold = await call('uie.project.open', { path: other.path });
  coldPid = JSON.parse(await readFile(discovery, 'utf8')).pid;
  assert.ok(Number.isInteger(coldPid) && coldPid !== process.pid);
  assert.equal(cold.workspacePath, other.path);
  assert.equal(cold.minimized, true);
  assert.equal((await state()).workspacePath, other.path);
  const duplicate = await call('uie.project.open', { path: other.path });
  assert.equal(duplicate.reused, true); assert.equal(duplicate.minimized, true);
  assert.equal(JSON.parse(await readFile(discovery, 'utf8')).pid, coldPid);
  const visible = await call('uie.project.open', { path: other.path, minimized: false });
  assert.equal(visible.minimized, false);
  assert.equal((await call('uie.project.open', { path: other.path })).minimized, true);
  console.log('PASS: Hub state, directory validation, duplicate reuse, unsaved/runtime protection, safe switch, saved reopen, MCP cold start and default/optional minimization.');
} finally {
  if (app) await app.close();
  if (coldStarted && !coldPid) coldPid = await readFile(discovery, 'utf8').then(s => JSON.parse(s).pid, () => undefined);
  if (coldPid) process.kill(coldPid); // Only the isolated instance launched by this test.
  mcp.kill(); lines.close();
  for (const item of replies.values()) clearTimeout(item.timer);
}
