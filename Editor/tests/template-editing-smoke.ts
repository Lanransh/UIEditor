import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createProject } from '../electron/projects';
import { writeDocument } from '../electron/documents';
import { robloxStrategy } from '../src/editor/roblox';

await mkdir(resolve('test-results'), { recursive: true });
const root = await mkdtemp(resolve('test-results/template-editing-smoke-'));
const project = (await createProject(root)).project;
const runtime = join(root, 'runtime');
const template = robloxStrategy.createDocument('RewardCard');
const panel = robloxStrategy.createNode('Frame'); panel.name = 'RewardPanel';
template.root.children.push(panel);
const templatePath = join(project.path, 'AgentWorkspace/styles/templates/奖励/RewardCard.rbxui.json');
await writeDocument(templatePath, template);
const mcp = spawn(process.execPath, [resolve('mcp-dist/server.mjs'), '--stdio', '--discovery', join(runtime, 'ui-editor-automation.json')], { windowsHide: true, stdio: 'pipe' });
let id = 0;
const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
const lines = createInterface({ input: mcp.stdout });
lines.on('line', line => { const message = JSON.parse(line); const item = pending.get(message.id); if (!item) return; clearTimeout(item.timer); pending.delete(message.id); if (message.error) item.reject(new Error(JSON.stringify(message.error))); else item.resolve(message.result); });
function rpc(method: string, params: unknown = {}) {
  return new Promise<any>((resolve, reject) => { const requestId = ++id; const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`MCP timeout: ${method}`)); }, 20000); pending.set(requestId, { resolve, reject, timer }); mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }) + '\n'); });
}
async function raw(name: string, args: object = {}) { return rpc('tools/call', { name, arguments: args }); }
async function call(name: string, args: object = {}) { const result = await raw(name, args); assert.ok(!result.isError, result.content?.[0]?.text); return JSON.parse(result.content[0].text); }
const state = () => call('uie.editor.get_state', { detail: 'full' });
async function mutate(name: string, args: object = {}) { const s = await state(); return call(name, { sessionId: s.sessionId, revision: s.revision, ...args }); }
let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
try {
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'template-test', version: '1' } });
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), UI_EDITOR_BACKGROUND: '1', UI_EDITOR_USER_DATA: runtime, UI_EDITOR_OPEN_WORKSPACE: project.path }; delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: ['.'], env });
  const page = await app.firstWindow(); page.setDefaultTimeout(15000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: '运行', exact: true }).waitFor();
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(w => w.isVisible() || w.isFocused())), false);
  const initial = await state();
  assert.equal(initial.workspacePath, project.path);
  assert.equal(initial.agentWorkspacePath, join(project.path, 'AgentWorkspace'));
  assert.equal(initial.gameDesignPath, join(project.path, 'AgentWorkspace/styles/Game-DESIGN.md'));
  assert.equal(initial.gameDesignExists, false);
  await writeFile(initial.gameDesignPath, '# Project style\nBlue buttons.\n');
  assert.equal((await state()).gameDesignExists, true);
  assert.match(await readFile(join(initial.agentWorkspacePath, 'AGENTS.md'), 'utf8'), /只有用户明确提出修改模板/);
  const target = { library: 'templates', documentId: template.id };
  assert.equal((await call('uie.document.list', { library: 'templates' })).interfaces[0].documentId, template.id);
  // The visible template action opens the original, not a detached copy.
  await page.getByRole('button', { name: '模板参考', exact: true }).click();
  await page.getByRole('button', { name: 'UI 资产 RewardCard', exact: true }).click({ button: 'right' });
  assert.equal(await page.getByRole('menuitem', { name: '打开副本', exact: true }).count(), 0);
  await page.getByRole('menuitem', { name: '打开', exact: true }).click();
  await page.getByText('编辑模板 · 奖励/RewardCard.rbxui.json', { exact: true }).waitFor();
  assert.equal((await state()).library, 'templates');
  await mutate('uie.scripts.set', { source: '-- changed by MCP' });
  await page.locator('.canvas-viewport').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  assert.equal((await state()).document.scripts.source, template.scripts.source);
  await page.keyboard.press('Control+y');
  assert.equal((await state()).document.scripts.source, '-- changed by MCP');
  await page.keyboard.press('Control+s');
  await page.waitForFunction(() => document.querySelector('.workspace-status')?.textContent?.includes('界面已保存'));
  assert.equal(JSON.parse(await readFile(templatePath, 'utf8')).scripts.source, '-- changed by MCP');
  // Manual edit, MCP save, UUID reopen, stable document and node IDs.
  await page.getByRole('button', { name: '选择节点 RewardPanel', exact: true }).click();
  await page.getByLabel('节点名称', { exact: true }).fill('UpdatedPanel');
  await page.getByLabel('节点名称', { exact: true }).press('Tab');
  await mutate('uie.document.save');
  await mutate('uie.document.open', { target, mode: 'edit' });
  let saved = await state();
  assert.equal(saved.dirty, false); assert.equal(saved.documentId, template.id);
  assert.equal(saved.document.root.children[0].id, panel.id);
  assert.equal(saved.document.root.children[0].name, 'UpdatedPanel');
  await page.screenshot({ path: join(root, 'template-workspace.png') });
  const picture = await raw('uie.debug.screenshot'); assert.ok(!picture.isError);
  await writeFile(join(root, 'template-editing.png'), Buffer.from(picture.content[0].data, 'base64'));
  // Saving a snapshot onto the active template must also update its saved baseline.
  await mutate('uie.scripts.set', { source: '-- snapshot onto original' });
  await page.getByRole('button', { name: '选择节点 UpdatedPanel', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '保存…', exact: true }).click();
  await page.getByLabel('保存到', { exact: true }).selectOption('templates');
  await page.getByLabel('模板文件夹', { exact: true }).selectOption('奖励');
  await page.getByRole('dialog', { name: '保存UI', exact: true }).getByRole('button', { name: '保存', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.workspace-status')?.textContent?.includes('界面已保存'));
  assert.equal((await state()).dirty, false);
  await mutate('uie.document.save');
  // External writes are preserved, and dirty content stays in the editor after failure.
  const external = { ...JSON.parse(await readFile(templatePath, 'utf8')), name: 'ExternalCard' };
  await writeDocument(templatePath, external);
  await mutate('uie.scripts.set', { source: '-- unsaved local' });
  saved = await state();
  const conflict = await raw('uie.document.save', { sessionId: saved.sessionId, revision: saved.revision });
  assert.equal(conflict.isError, true); assert.match(conflict.content[0].text, /外部修改/);
  assert.equal((await state()).dirty, true);
  assert.deepEqual(JSON.parse(await readFile(templatePath, 'utf8')), external);
  const dirtyOpen = await raw('uie.document.open', { sessionId: saved.sessionId, revision: saved.revision, target, mode: 'edit' });
  assert.equal(dirtyOpen.isError, true);
  await mutate('uie.document.open', { target, mode: 'copy', discardChanges: true });
  assert.equal((await state()).library, null);
  await mutate('uie.scripts.set', { source: '-- copy only' });
  await mutate('uie.document.save', { relativePath: 'Copy.rbxui.json' });
  assert.equal((await state()).library, 'project');
  assert.deepEqual(JSON.parse(await readFile(templatePath, 'utf8')), external);
  await mutate('uie.document.open', { relativePath: 'Copy.rbxui.json' });
  assert.equal((await state()).document.scripts.source, '-- copy only');
  saved = await state();
  const crossProject = await raw('uie.document.open', { sessionId: saved.sessionId, revision: saved.revision, target: { ...target, projectId: '12345678-1234-4123-8123-123456789abc' }, mode: 'edit' });
  assert.equal(crossProject.isError, true); assert.match(crossProject.content[0].text, /当前工程/);
  // Reopening the project syncs managed guidance, preserving user style and template edits.
  await page.getByRole('button', { name: '文件', exact: true }).click();
  await page.getByRole('button', { name: '返回 Hub', exact: true }).click();
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, project.path);
  await page.getByRole('button', { name: '打开工程', exact: true }).click();
  await page.getByRole('button', { name: '运行', exact: true }).waitFor();
  assert.equal(await readFile(initial.gameDesignPath, 'utf8'), '# Project style\nBlue buttons.\n');
  assert.deepEqual(JSON.parse(await readFile(templatePath, 'utf8')), external);
  assert.deepEqual(errors, []);
  console.log(`Template UI and MCP editing passed: ${root}`);
} finally {
  if (app) await app.close();
  lines.close(); mcp.kill();
  for (const item of pending.values()) clearTimeout(item.timer);
}
