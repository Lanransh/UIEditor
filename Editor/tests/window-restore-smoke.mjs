import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

await mkdir(resolve('test-results'), { recursive: true });
const root = await mkdtemp(resolve('test-results/window-restore-'));
const packaged = process.argv.includes('--packaged');
const env = { ...process.env, UI_EDITOR_BACKGROUND: '0', UI_EDITOR_USER_DATA: join(root, 'runtime') };
delete env.ELECTRON_RUN_AS_NODE;
delete env.UI_EDITOR_OPEN_WORKSPACE;
const application = await electron.launch(packaged
  ? { executablePath: resolve('../ToolRuntime/UIEditor-win32-x64/UIEditor.exe'), args: [], env }
  : { args: ['.'], env });
try {
  const page = await application.firstWindow();
  await page.getByRole('heading', { name: '选择工程', exact: true }).waitFor();
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
  const executable = await application.evaluate(() => process.execPath);
  const child = packaged
    ? spawn('cmd.exe', ['/d', '/c', resolve('../Run.bat')], { env, windowsHide: true, stdio: 'ignore' })
    : spawn(executable, ['.'], { cwd: process.cwd(), env, windowsHide: true, stdio: 'ignore' });
  await new Promise((done, reject) => {
    child.once('error', reject);
    child.once('exit', code => code === 0 ? done() : reject(new Error(`Second launch exited ${code}`)));
  });
  let visible = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    visible = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible());
    if (visible) break;
    await delay(100);
  }
  assert.equal(visible, true, 'Launching again must show an existing hidden main window');
  console.log(`PASS: ${packaged ? 'Run.bat' : 'second launch'} restores the existing hidden window.`);
} finally { await application.close(); }
