import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { callTool } from '../mcp/server';

const fixture = resolve(import.meta.dirname, 'fixtures/roblox-welfare');
const original = join(fixture, 'UIEditorWorkspace');
const relativePath = 'interfaces/WelfareHub.rbxui.json';
const before = await readFile(join(original, relativePath), 'utf8');
await mkdir(resolve('test-results'), { recursive: true });
const output = await mkdtemp(resolve('test-results/welfare-'));
const update = process.argv.includes('--update-fixture');
const workspace = update ? original : join(output, 'UIEditorWorkspace');
if (!update) await cp(original, workspace, { recursive: true });
const discovery = join(output, 'runtime/ui-editor-automation.json');
async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await callTool(name, args, discovery);
  return JSON.parse(result.content[0].text!);
}
async function mutate(name: string, args: Record<string, unknown> = {}) {
  const state = await call('uie.editor.get_state');
  return call(name, { sessionId: state.sessionId, revision: state.revision, ...args });
}
const scripts = {
  source: await readFile(join(fixture, 'CWelfareView.lua'), 'utf8'),
  integration: await readFile(join(fixture, 'CWelfarePreview.lua'), 'utf8'),
};
const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), UI_EDITOR_BACKGROUND: '1', UI_EDITOR_USER_DATA: join(output, 'runtime'), UI_EDITOR_OPEN_WORKSPACE: workspace };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
try {
  const page = await app.firstWindow();
  await page.getByRole('button', { name: '运行', exact: true }).waitFor();
  await mutate('uie.document.open', { relativePath: 'WelfareHub.rbxui.json' });
  const initial = await call('uie.editor.get_state', { detail: 'full' });
  assert.equal(initial.projectId, JSON.parse(await readFile(join(workspace, 'project.json'), 'utf8')).id);
  if (update) {
    await mutate('uie.scripts.set', scripts);
    await mutate('uie.document.save');
    await mutate('uie.document.open', { relativePath: 'WelfareHub.rbxui.json' });
  }
  assert.deepEqual((await call('uie.scripts.get')).scripts, scripts);
  assert.deepEqual((await call('uie.editor.get_state', { detail: 'full' })).document.root, initial.document.root);
  await mutate('uie.runtime.control', { action: 'run' });
  async function find(name: string) {
    const result = await call('uie.nodes.find', { name, view: 'runtime' });
    assert.equal(result.nodes.length, 1, name);
    return result.nodes[0].id;
  }
  async function shot(name: string) {
    const result = await callTool('uie.debug.screenshot', {}, discovery);
    assert.equal(result.content[0].type, 'image');
    await writeFile(join(output, name + '.png'), Buffer.from(result.content[0].data!, 'base64'));
  }
  await shot('online');
  const reward = await find('Item_online_5Img');
  const button = (await call('uie.nodes.find', { name: 'ClaimBtn', parentId: reward, view: 'runtime' })).nodes[0].id;
  const batch = await mutate('uie.runtime.batch', { steps: [
    { action: 'click', id: button, dispatched: true, reason: null },
    { action: 'assert', id: button, disabled: true },
    { action: 'click', id: button, dispatched: false, reason: 'disabled' },
    { action: 'click', id: await find('SignInTabBtn'), dispatched: true, reason: null },
    { action: 'assert', id: await find('SignInBox'), properties: { Visible: true } },
  ] });
  assert.equal(batch.success, true, JSON.stringify(batch));
  await page.getByTestId('ui-artboard').getByText('Daily Login · Day 1', { exact: true }).waitFor({ state: 'visible' });
  await shot('sign-in');
  await mutate('uie.runtime.click', { id: await find('TasksTabBtn') });
  await shot('tasks');
  await mutate('uie.runtime.control', { action: 'stop' });
  await mutate('uie.document.save');
  await mutate('uie.document.open', { relativePath: 'WelfareHub.rbxui.json' });
  assert.deepEqual((await call('uie.scripts.get')).scripts, scripts);
  assert.deepEqual((await call('uie.editor.get_state', { detail: 'full' })).document.root, initial.document.root);
  if (!update) assert.equal(await readFile(join(original, relativePath), 'utf8'), before);
  console.log(`Welfare MCP smoke passed: ${output}`);
} finally { await app.close(); }
