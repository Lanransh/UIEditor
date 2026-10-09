import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const output = resolve('test-results/image-upload-reconnect'); await mkdir(output, { recursive: true });
const server = await createServer({ server: { port: 0 } }); await server.listen();
const url = `http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/image-upload.html`;
const env = { ...process.env, UI_EDITOR_BACKGROUND: '1', UI_EDITOR_USER_DATA: await mkdtemp(resolve(output, 'runtime-')) }; delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ args: ['.'], env });
  await app.firstWindow();
  const created = app.waitForEvent('window');
  await app.evaluate(async ({ BrowserWindow }, url) => {
    const window = new BrowserWindow({ show: false, width: 900, height: 700, webPreferences: { sandbox: true, backgroundThrottling: false } });
    await window.loadURL(url);
  }, url);
  const page = await created; page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.clock.install(); await page.clock.pauseAt(new Date());
  const dialog = page.getByRole('dialog', { name: '上传图片到 Roblox', exact: true });
  const retry = dialog.getByText('连接不可用，每隔 5 秒自动重试连接…', { exact: true });
  async function count(key) { return page.evaluate(key => window.uploadQA[key], key); }
  async function open(mode) {
    await page.goto(`${url}?mode=${mode}`);
    await dialog.waitFor();
    await page.getByRole('button', { name: '关闭', exact: true }).waitFor({ state: 'visible' });
  }

  await open('offline'); await retry.waitFor();
  const first = await count('discoveries');
  await page.clock.runFor(4999); assert.equal(await count('discoveries'), first);
  await page.clock.runFor(1); assert.equal(await count('discoveries'), first + 1);
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent === '关闭').disabled);
  await page.evaluate(() => { window.uploadQA.mode = 'automatic'; });
  await page.clock.runFor(5000); await dialog.getByText('处理中', { exact: true }).waitFor();
  assert.equal(await count('submissions'), 1);
  await page.clock.runFor(3000); await dialog.getByText(/ID 已自动保存/).waitFor();
  assert.equal(await count('saved'), 'rbxassetid://123');
  const connected = await count('discoveries');
  await page.clock.runFor(15000); assert.equal(await count('discoveries'), connected);

  await open('empty'); await retry.waitFor();
  await page.evaluate(() => { window.uploadQA.mode = 'automatic'; });
  await page.clock.runFor(5000); await dialog.getByText('处理中', { exact: true }).waitFor();
  assert.equal(await count('submissions'), 1);

  await open('manual');
  await dialog.getByLabel('图片上传目标工程').selectOption('game');
  await page.evaluate(() => { window.uploadQA.failQuery = true; });
  await dialog.getByRole('button', { name: '上传图片', exact: true }).click();
  await page.clock.runFor(3000); await retry.waitFor();
  await page.evaluate(() => { window.uploadQA.available = false; });
  await page.clock.runFor(5000); await dialog.getByRole('alert').getByText(/目标工程连接已失效/).waitFor();
  assert.equal(await count('submissions'), 1); assert.equal(await count('selected'), 'game');
  await page.evaluate(() => { window.uploadQA.available = true; window.uploadQA.failQuery = false; });
  await page.clock.runFor(5000); await dialog.getByText(/ID 已自动保存/).waitFor();
  assert.equal(await count('submissions'), 1); assert.equal(await count('queries'), 2);

  await open('manual');
  await dialog.getByLabel('图片上传目标工程').selectOption('game');
  await page.evaluate(() => { window.uploadQA.uploadFailure = '连接已失效，请重新连接工程'; });
  await dialog.getByRole('button', { name: '上传图片', exact: true }).click(); await retry.waitFor();
  await page.evaluate(() => { window.uploadQA.uploadFailure = ''; });
  await page.clock.runFor(5000); await dialog.getByText('处理中', { exact: true }).waitFor();
  assert.equal(await count('submissions'), 2);

  await open('manual');
  await dialog.getByLabel('图片上传目标工程').selectOption('game');
  await page.evaluate(() => { window.uploadQA.uploadFailure = '审核拒绝'; });
  await dialog.getByRole('button', { name: '上传图片', exact: true }).click();
  await dialog.getByText('审核拒绝', { exact: true }).waitFor();
  await page.clock.runFor(15000); assert.equal(await count('submissions'), 1); assert.equal(await count('discoveries'), 1);

  await open('old'); await dialog.getByRole('alert').waitFor();
  await page.clock.runFor(15000); assert.equal(await count('discoveries'), 1);

  await open('offline'); await retry.waitFor();
  await page.evaluate(() => { window.uploadQA.pending = true; });
  await page.clock.runFor(5000); assert.equal(await count('discoveries'), 2);
  await page.clock.runFor(15000); assert.equal(await count('discoveries'), 2);
  await page.evaluate(() => document.querySelector('body > #root > button').click());
  await page.getByText('已关闭', { exact: true }).waitFor();
  await page.evaluate(() => { window.uploadQA.mode = 'automatic'; window.uploadQA.release(); });
  await page.clock.runFor(15000); assert.equal(await count('discoveries'), 2); assert.equal(await count('submissions'), 0);

  await open('offline'); await retry.waitFor();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await page.clock.runFor(15000); assert.equal(await count('discoveries'), 1);
  assert.deepEqual(errors, []);
  console.log('Image upload reconnect: 5-second retries, startup recovery, original target/task, success stop, terminal failures, serial requests and cleanup passed');
} finally {
  if (app) { await app.evaluate(({ app }) => app.exit()).catch(() => {}); await app.close(); }
  await server.close();
}
