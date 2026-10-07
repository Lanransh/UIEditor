import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const output = resolve('test-results/roblox-import'); await mkdir(output, { recursive: true });
const server = await createServer({ server: { port: 0 } }); await server.listen();
const address = server.httpServer.address();
const url = `http://127.0.0.1:${address.port}/tests/fixtures/roblox-import.html`;
const env = { ...process.env, UI_EDITOR_BACKGROUND: '1', UI_EDITOR_USER_DATA: await mkdtemp(resolve(output, 'runtime-')) }; delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ args: ['.'], env });
  await app.firstWindow();
  const created = app.waitForEvent('window');
  await app.evaluate(async ({ BrowserWindow }, url) => {
    const window = new BrowserWindow({ show: false, width: 900, height: 700, webPreferences: { sandbox: true } });
    await window.loadURL(url);
  }, url);
  const page = await created; page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: '导入 UI 和脚本' }).waitFor();
  await page.waitForFunction(() => document.querySelector('select').value === 'game');
  await page.getByRole('button', { name: '导入 UI 和脚本' }).click();
  await page.getByRole('status').getByText('等待 Studio 回执', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.importQA.submitted), 1);
  assert.equal(await page.getByRole('button', { name: '关闭', exact: true }).count(), 0);
  await page.evaluate(() => { window.importQA.failTask = true; });
  await page.getByRole('alert').getByText('连接已失效', { exact: true }).waitFor();
  await page.evaluate(() => { window.importQA.failTask = false; window.importQA.succeed(); });
  await page.getByRole('status').getByText('UI 已导入 Studio', { exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, 'succeeded.png') });
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByText('已关闭', { exact: true }).waitFor();
  await page.reload();
  await page.waitForFunction(() => !!window.importQA);
  await page.evaluate(() => { window.importQA.failDiscovery = true; });
  await page.getByRole('button', { name: '刷新连接' }).click();
  await page.getByRole('alert').getByText('后台未启动', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Roblox import dialog: target selection, submission, receipt, connection failure and close passed');
} finally {
  if (app) { await app.evaluate(({ app }) => app.exit()).catch(() => {}); await app.close(); }
  await server.close();
}
