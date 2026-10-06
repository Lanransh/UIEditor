import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

await mkdir(resolve('test-results'), { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: resolve('ToolRuntime/UIEditor-win32-x64/UIEditor.exe'), args: [], env });
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
  assert.equal(runtime.userData, resolve('ToolRuntime/Runtime/userData'));
  assert.equal(runtime.preferences.contextIsolation, true);
  assert.equal(runtime.preferences.nodeIntegration, false);
  assert.equal(runtime.preferences.sandbox, true);
  await page.screenshot({ path: resolve('test-results/packaged-hub.png') });
  console.log('PASS: packaged exe, Hub, IPC, ToolRuntime paths, sandbox and context isolation.');
} finally { await app.close(); }
