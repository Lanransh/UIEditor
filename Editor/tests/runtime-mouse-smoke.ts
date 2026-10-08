import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createProject } from '../electron/projects';
import { mouseFixture } from './runtime-mouse-fixture';

await mkdir(resolve('test-results'), { recursive: true });
const root = await mkdtemp(resolve('test-results/mouse-smoke-'));
const runtime = join(root, 'runtime'), discovery = join(runtime, 'ui-editor-automation.json');
const serverPath = resolve('mcp-dist/server.mjs');
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

let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
try {
  const parent = join(root, 'project'); await mkdir(parent);
  await createProject(parent);
  const project = join(parent, 'UIEditorWorkspace');
  const fixture = mouseFixture();
  await writeFile(join(project, 'interfaces/mouse.rbxui.json'), JSON.stringify(fixture.document));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), UI_EDITOR_BACKGROUND: '1', UI_EDITOR_USER_DATA: runtime, UI_EDITOR_OPEN_WORKSPACE: project }; delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: ['.'], env });
  const page = await app.firstWindow(); page.setDefaultTimeout(15000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: '运行', exact: true }).waitFor();
  await mutate('uie.document.open', { relativePath: 'mouse.rbxui.json' });
  const initial = await state('full');
  const artboard = page.getByTestId('ui-artboard'), viewport = page.locator('.canvas-viewport');
  await page.getByRole('combobox', { name: '画布缩放' }).selectOption('0.75');
  const editTransform = await artboard.getAttribute('style');
  assert.equal((await mutate('uie.runtime.control', { action: 'run' })).result.ok, true);
  assert.equal(await page.getByRole('combobox', { name: '画布缩放' }).isEnabled(), false);
  const button = page.locator(`[data-node-id="${fixture.button.id}"]`);
  await button.click();
  await page.waitForFunction(id => document.querySelector(`[data-node-id="${id}"]`)?.textContent === 'click', fixture.button.id);
  const fitted = await artboard.getAttribute('style');
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x+box.width/2, box.y+box.height/2);
  await page.keyboard.down('Control'); await page.mouse.wheel(0, 100); await page.keyboard.up('Control');
  assert.equal(await artboard.getAttribute('style'), fitted);
  await mutate('uie.runtime.hover', { id: null });
  const batch = await mutate('uie.runtime.batch', { steps: [
    { action: 'hover', id: fixture.button.id },
    { action: 'assert', id: fixture.button.id, hovered: true, properties: { Text: 'hover' } },
    { action: 'drag', id: fixture.button.id, from: { x: .1, y: .5 }, to: { x: .9, y: .5 }, steps: 3 },
    { action: 'assert', id: fixture.button.id, pressed: false, properties: { Text: 'up' } },
    { action: 'scroll', id: fixture.scroll.id, to: { y: 300 } },
    { action: 'assert', id: fixture.scroll.id, properties: { CanvasPosition: { x: 0, y: 300 } } },
    { action: 'click', id: fixture.button.id },
    { action: 'assert', id: fixture.button.id, properties: { Text: 'click' } },
  ] });
  assert.equal(batch.success, true, JSON.stringify(batch));
  await mutate('uie.runtime.scroll', { id: fixture.scroll.id, to: { y: 0 } });
  const content = page.locator(`[data-node-id="${fixture.child.id}"]`);
  await content.hover(); await page.mouse.wheel(0, 100);
  await page.waitForFunction(id => Number(document.querySelector(`[data-node-id="${id}"] [data-scroll-axis="y"]`)?.getAttribute('data-position')) > 0, fixture.scroll.id);
  const list = await call('uie.nodes.get', { id: fixture.scroll.id, view: 'runtime' });
  assert.equal(list.node.properties.CanvasPosition.y, 100);
  const bar = page.locator(`[data-node-id="${fixture.scroll.id}"] > div > [data-scroll-axis="y"]`);
  const barBox = (await bar.boundingBox())!;
  await page.mouse.move(barBox.x+barBox.width/2, barBox.y+barBox.height/2);
  await page.mouse.down(); await page.mouse.move(barBox.x+barBox.width/2, barBox.y+barBox.height/2+35, { steps: 3 }); await page.mouse.up();
  await page.waitForFunction(id => Number(document.querySelector(`[data-node-id="${id}"] [data-scroll-axis="y"]`)?.getAttribute('data-position')) > 100, fixture.scroll.id);
  // Physical drag produces mouse events without activating the button or moving the artboard.
  await button.hover();
  const dragBox = (await button.boundingBox())!;
  await page.mouse.move(dragBox.x+5, dragBox.y+dragBox.height/2); await page.mouse.down();
  await page.mouse.move(dragBox.x+dragBox.width-5, dragBox.y+dragBox.height/2, { steps: 3 }); await page.mouse.up();
  await page.waitForFunction(id => document.querySelector(`[data-node-id="${id}"]`)?.textContent === 'up', fixture.button.id);
  assert.equal(await artboard.getAttribute('style'), fitted);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1500, 950));
  await page.waitForFunction(previous => document.querySelector('.ui-artboard')?.getAttribute('style') !== previous, fitted);
  const size = await viewport.boundingBox();
  const scale = Number(await viewport.getAttribute('data-zoom'));
  assert.ok(Math.abs(scale - Math.min((size!.width-48)/1280, (size!.height-48)/720)) < .01);
  const diagnostics = await call('uie.debug.get_diagnostics');
  assert.ok(diagnostics.logs.some((log: any) => log.kind === 'input'));
  assert.ok(!(await raw('uie.debug.screenshot')).isError);
  await mutate('uie.runtime.control', { action: 'stop' });
  await page.waitForFunction(expected => document.querySelector('.ui-artboard')?.getAttribute('style') === expected, editTransform);
  const final = await state('full');
  assert.deepEqual(final.document, initial.document); assert.equal(final.revision, initial.revision); assert.equal(final.dirty, initial.dirty);
  // A burst over an unobserved list must not enqueue one full frame per wheel tick.
  await mutate('uie.scripts.set', { source: 'local UI = _G.FX.Class("CMouseView", "CUIView") return UI' });
  await mutate('uie.runtime.control', { action: 'run' });
  await page.waitForFunction(id => !!document.querySelector(`[data-node-id="${id}"] [data-scroll-axis="y"]`), fixture.scroll.id);
  const beforeBurst = await call('uie.nodes.get', { id: fixture.scroll.id, view: 'runtime' });
  await page.evaluate(id => {
    const target = document.querySelector(`[data-node-id="${id}"]`)!;
    for (let i = 0; i < 50; i++) target.dispatchEvent(new WheelEvent('wheel', { deltaY: 2, bubbles: true, cancelable: true }));
  }, fixture.child.id);
  await page.waitForFunction(id => Number(document.querySelector(`[data-node-id="${id}"] [data-scroll-axis="y"]`)?.getAttribute('data-position')) === 100, fixture.scroll.id);
  const afterBurst = await call('uie.nodes.get', { id: fixture.scroll.id, view: 'runtime' });
  assert.equal(afterBurst.frameSequence - beforeBurst.frameSequence, 1);
  await mutate('uie.runtime.control', { action: 'stop' });
  await mutate('uie.scripts.set', { source: fixture.document.scripts.source });
  assert.deepEqual(errors, []);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(w => !w.isVisible() && !w.isFocused())), true);
  console.log(`Mouse runtime and MCP smoke passed: ${root}`);
} catch (error) {
  const diagnostics = await call('uie.debug.get_diagnostics').catch(() => null);
  console.error(JSON.stringify(diagnostics && { ...diagnostics, logs: diagnostics.logs.slice(-12) }));
  throw error;
} finally {
  if (app) await app.close(); lines.close(); mcp.kill(); for (const item of pending.values()) clearTimeout(item.timer);
}
