import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createProject } from '../electron/projects';
import { writeDocument } from '../electron/documents';
import { rewardExample } from '../src/editor/scriptExample';
import { callTool } from '../mcp/server';

await mkdir(resolve('test-results'), { recursive: true });
const output = await mkdtemp(resolve('test-results/screenshot-background-'));
const parent = join(output, 'project'); await mkdir(parent);
const { project } = await createProject(parent);
const document = rewardExample();
await writeDocument(join(project.path, 'interfaces', 'Reward.json'), document);
const discovery = join(output, 'runtime/ui-editor-automation.json');
const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), UI_EDITOR_BACKGROUND: '0', UI_EDITOR_USER_DATA: join(output, 'runtime'), UI_EDITOR_OPEN_WORKSPACE: project.path };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await callTool(name, args, discovery);
  return JSON.parse(result.content[0].text!);
}
async function mutate(name: string, args: Record<string, unknown> = {}) {
  const state = await call('uie.editor.get_state');
  return call(name, { sessionId: state.sessionId, revision: state.revision, ...args });
}
async function windowState() {
  return app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return { minimized: window.isMinimized(), visible: window.isVisible(), focused: window.isFocused(), throttling: window.webContents.getBackgroundThrottling() };
  });
}
async function screenshot(name: string, color?: number[], args: Record<string, unknown> = {}) {
  console.log(`Screenshot: ${name}`);
  const before = await windowState();
  const state = await call('uie.editor.get_state', { detail: 'full' });
  const result = await callTool('uie.debug.screenshot', args, discovery);
  assert.equal(result.content[0].type, 'image');
  const png = result.content[0].data!;
  const metadata = JSON.parse(result.content[1].text!);
  assert.ok(metadata.width > 0 && metadata.height > 0);
  await writeFile(join(output, `${name}.png`), Buffer.from(png, 'base64'));
  if (color) {
    const count = await app.evaluate(({ nativeImage }, { png, color }) => {
      const bitmap = nativeImage.createFromBuffer(Buffer.from(png, 'base64')).getBitmap() as unknown as Buffer;
      let count = 0;
      for (let i = 0; i < bitmap.length; i += 4) {
        if (bitmap[i] === color[2] && bitmap[i + 1] === color[1] && bitmap[i + 2] === color[0] && bitmap[i + 3] === 255) ++count;
      }
      return count;
    }, { png, color });
    assert.ok(count > 100, `${name}: expected current button color, got ${count} pixels`);
  }
  assert.deepEqual(await windowState(), before);
  assert.deepEqual(await call('uie.editor.get_state', { detail: 'full' }), state);
}
try {
  const page = await app.firstWindow();
  await page.getByRole('button', { name: '运行', exact: true }).waitFor();
  await mutate('uie.document.open', { relativePath: 'Reward.json' });
  await screenshot('foreground-design');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
  await screenshot('hidden-design');
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.minimize();
    const events: string[] = [];
    (globalThis as any).screenshotWindowEvents = events;
    // Assert before teardown: Playwright may restore minimized windows when closing the app.
    window.on('show', () => { events.push('show'); });
    window.on('restore', () => { events.push('restore'); });
    window.on('focus', () => { events.push('focus'); });
  });
  assert.equal((await windowState()).minimized, true);
  await screenshot('minimized-design');
  const run = await mutate('uie.runtime.control', { action: 'run' });
  assert.equal(run.result.ok, true, JSON.stringify(run));
  await screenshot('minimized-ready', [0x42, 0xb8, 0x83]);
  const button = (await call('uie.nodes.find', { name: 'ClaimButton', view: 'runtime' })).nodes[0];
  await mutate('uie.runtime.click', { id: button.id });
  await screenshot('minimized-claimed', [0x66, 0x77, 0x77]);
  await screenshot('minimized-saved', undefined, { target: { library: 'project', documentId: document.id } });
  await mutate('uie.runtime.control', { action: 'stop' });
  // Capture failure must also restore throttling and leave subsequent requests usable.
  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    const capture = contents.capturePage;
    contents.capturePage = () => {
      contents.capturePage = capture;
      return Promise.reject(new Error('Injected screenshot failure'));
    };
  });
  const beforeFailure = await windowState();
  await assert.rejects(callTool('uie.debug.screenshot', {}, discovery), /Injected screenshot failure/);
  assert.deepEqual(await windowState(), beforeFailure);
  await screenshot('after-failure');
  // Existing unthrottled background mode must remain unthrottled.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
  await screenshot('unthrottled-design');
  assert.deepEqual(await app.evaluate(() => (globalThis as any).screenshotWindowEvents), []);
  console.log(`Background screenshot smoke passed: ${output}`);
} finally { await app.close(); }
