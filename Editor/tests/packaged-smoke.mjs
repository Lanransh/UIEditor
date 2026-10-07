import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { listPackage } from '@electron/asar';

await mkdir(resolve('test-results'), { recursive: true });
const output = resolve(process.env.UI_EDITOR_PACKAGE_OUTPUT || '../ToolRuntime');
const packagePath = resolve(output, 'UIEditor-win32-x64');
const entries = listPackage(resolve(packagePath, 'resources/app.asar')).map(path => path.replaceAll('\\', '/'));
assert.ok(entries.includes('/dist/index.html'));
assert.ok(entries.includes('/dist-electron/main.cjs'));
assert.ok(entries.includes('/dist-electron/preload.cjs'));
assert.ok(entries.every(path => path === '/package.json' || /^\/(?:dist|dist-electron)(?:\/|$)/.test(path)), 'app.asar must contain only bundled outputs and package.json');
const testRuntime = await mkdtemp(resolve('test-results/packaged-runtime-'));
const env = { ...process.env, UI_EDITOR_BACKGROUND: '1', UI_EDITOR_USER_DATA: testRuntime };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: resolve(packagePath, 'UIEditor.exe'), args: [], env });
try {
  const page = await app.firstWindow();
  await page.getByRole('heading', { name: '选择工程', exact: true }).waitFor();
  await page.getByRole('button', { name: '创建工程', exact: true }).waitFor();
  const result = await page.evaluate(() => window.projects.listRecent());
  assert.equal(result.ok, true);
  const runtime = await app.evaluate(({ app, BrowserWindow }) => ({
    packaged: app.isPackaged,
    userData: app.getPath('userData'),
    preferences: BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
  }));
  assert.equal(runtime.packaged, true);
  assert.equal(runtime.userData, resolve(testRuntime, 'userData'));
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(window => !window.isVisible() && !window.isFocused())), true);
  assert.equal(runtime.preferences.contextIsolation, true);
  assert.equal(runtime.preferences.nodeIntegration, false);
  assert.equal(runtime.preferences.sandbox, true);
  const png = await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const [width, height] = window.getContentSize();
    const image = await window.webContents.capturePage({ x: 0, y: 0, width, height }, { stayHidden: true, stayAwake: true });
    return image.toPNG().toString('base64');
  });
  await writeFile(resolve('test-results/packaged-hub.png'), Buffer.from(png, 'base64'));
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(window => !window.isVisible() && !window.isFocused())), true);
  console.log('PASS: packaged exe, Hub, IPC, ToolRuntime paths, sandbox and context isolation.');
} finally { await app.close(); }
