import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const output = resolve('test-results/batch-export');
await mkdir(output, { recursive: true });
const server = await createServer({ server: { port: 0 } });
await server.listen();
const address = server.httpServer.address();
const url = `http://127.0.0.1:${address.port}/tests/fixtures/batch-export.html`;
const env = {
  ...process.env,
  UI_EDITOR_BACKGROUND: '1',
  UI_EDITOR_USER_DATA: await mkdtemp(resolve(output, 'runtime-')),
};
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ args: ['.'], env });
  await app.firstWindow();
  const created = app.waitForEvent('window');
  await app.evaluate(async ({ BrowserWindow }, target) => {
    const window = new BrowserWindow({ show: false, width: 760, height: 520, webPreferences: { sandbox: true, backgroundThrottling: false } });
    await window.loadURL(target);
  }, url);
  const page = await created;
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  const exportButton = page.getByRole('button', { name: '批量导出', exact: true });
  await exportButton.waitFor();
  await exportButton.click();
  const panel = page.getByRole('region', { name: '多选导出项目UI', exact: true });
  await panel.waitFor();
  assert.equal(await panel.locator('.batch-export-item').count(), 2);
  assert.equal(await panel.locator('input:checked').count(), 1);
  await page.screenshot({ path: resolve(output, 'menu-open.png') });

  await panel.getByRole('button', { name: '全选', exact: true }).click();
  assert.equal(await panel.locator('.batch-export-item input:checked').count(), 2);
  await panel.getByRole('button', { name: '开始导出（2）', exact: true }).click();
  try {
    await panel.getByText('本轮完成 · 2 成功', { exact: true }).waitFor();
  } catch (error) {
    await page.screenshot({ path: resolve(output, 'queue-failed.png') });
    console.log(await panel.textContent({ timeout: 1000 }).catch(() => '导出面板已关闭'));
    console.log(await page.evaluate(() => window.batchExportQA));
    throw error;
  }

  assert.deepEqual(await page.evaluate(() => window.batchExportQA.submitted), ['FirstUI', 'SecondUI']);
  assert.deepEqual(await page.evaluate(() => window.batchExportQA.events), [
    'submit:FirstUI', 'status:FirstUI', 'submit:SecondUI', 'status:SecondUI',
  ]);
  assert.equal(await panel.locator('.batch-export-status.succeeded').count(), 2);
  assert.equal(await page.evaluate(() => window.batchExportQA.receivedImageId), 'rbxassetid://123');
  await page.screenshot({ path: resolve(output, 'queue-complete.png') });

  await page.evaluate(() => { window.batchExportQA.failFirst = true; window.batchExportQA.events = []; });
  await panel.getByRole('button', { name: '开始导出（2）', exact: true }).click();
  await panel.getByText('本轮完成 · 1 成功 · 1 失败', { exact: true }).waitFor();
  assert.equal(await panel.locator('.batch-export-status.failed').count(), 1);
  assert.deepEqual(await page.evaluate(() => window.batchExportQA.events), [
    'submit:FirstUI', 'status:FirstUI', 'submit:SecondUI', 'status:SecondUI',
  ]);

  await page.evaluate(() => { window.batchExportQA.multipleTargets = true; window.batchExportQA.events = []; });
  await panel.getByRole('button', { name: '开始导出（2）', exact: true }).click();
  await panel.getByRole('alert').getByText('Toolkit 连接了多个游戏工程，请在 Toolkit 仅保留本次导出的工程连接。', { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.batchExportQA.events), []);

  await page.evaluate(() => {
    Object.assign(window.batchExportQA, { failFirst: false, multipleTargets: false, failPoll: true, events: [], submitted: [] });
  });
  await panel.getByRole('button', { name: '开始导出（2）', exact: true }).click();
  await panel.locator('.batch-export-progress strong').getByText(/查询连接中断/).waitFor();
  await panel.getByRole('button', { name: '停止队列', exact: true }).click();
  await panel.getByRole('button', { name: '继续队列', exact: true }).waitFor();
  await panel.getByRole('status').getByText(/任务：FirstUI/).waitFor();
  await page.screenshot({ path: resolve(output, 'queue-stopped.png') });
  assert.deepEqual(await page.evaluate(() => window.batchExportQA.submitted), ['FirstUI']);
  await page.evaluate(() => { window.batchExportQA.failPoll = false; });
  await panel.getByRole('button', { name: '继续队列', exact: true }).click();
  await panel.getByText('本轮完成 · 2 成功', { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.batchExportQA.submitted), ['FirstUI', 'SecondUI']);

  await page.evaluate(() => { Object.assign(window.batchExportQA, { hold: true, events: [], submitted: [] }); });
  await panel.getByRole('button', { name: '开始导出（2）', exact: true }).click();
  await page.waitForFunction(() => window.batchExportQA.submitted.length === 1, {}, { polling: 100 });
  await panel.getByRole('button', { name: '停止队列', exact: true }).click();
  await panel.getByRole('button', { name: '取消当前任务', exact: true }).waitFor();
  await page.evaluate(() => { window.batchExportQA.cancelError = true; });
  await panel.getByRole('button', { name: '取消当前任务', exact: true }).click();
  await panel.getByRole('alert').getByText('取消失败', { exact: true }).waitFor();
  await panel.getByRole('status').getByText(/任务：FirstUI/).waitFor();
  await page.evaluate(() => { window.batchExportQA.cancelError = false; });
  await panel.getByRole('button', { name: '取消当前任务', exact: true }).click();
  await panel.getByText('队列已停止 · 0 成功 · 1 失败', { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.batchExportQA.submitted), ['FirstUI']);

  await page.evaluate(() => { Object.assign(window.batchExportQA, { hold: false, loseResponse: true, events: [], submitted: [] }); });
  await panel.getByRole('button', { name: '开始导出（2）', exact: true }).click();
  await panel.getByRole('button', { name: '重试当前项', exact: true }).waitFor();
  await panel.getByRole('status').getByText(/提交结果未知/).waitFor();
  assert.deepEqual(await page.evaluate(() => window.batchExportQA.submitted), ['FirstUI']);
  assert.equal(await panel.getByRole('button', { name: '开始导出（2）', exact: true }).count(), 0);
  await page.evaluate(() => { window.batchExportQA.changeImageId('rbxassetid://456'); });
  await panel.getByRole('button', { name: '重试当前项', exact: true }).click();
  await panel.getByText('本轮完成 · 2 成功', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.batchExportQA.receivedImageId), 'rbxassetid://123');
  assert.deepEqual(await page.evaluate(() => window.batchExportQA.events), [
    'submit:FirstUI', 'submit:FirstUI', 'status:FirstUI', 'submit:SecondUI', 'status:SecondUI',
  ]);

  await page.evaluate(() => { Object.assign(window.batchExportQA, { events: [], submitted: [] }); });
  await panel.getByRole('button', { name: '开始导出（2）', exact: true }).click();
  await page.waitForFunction(() => window.batchExportQA.submitted.length === 1, {}, { polling: 100 });
  await page.evaluate(() => window.batchExportQA.unmount());
  await page.getByText('已返回 Hub', { exact: true }).waitFor();
  await delay(2200);
  assert.deepEqual(await page.evaluate(() => window.batchExportQA.events), ['submit:FirstUI']);

  await page.reload();
  await exportButton.click();
  await panel.getByRole('button', { name: '全选', exact: true }).click();
  await page.evaluate(() => { window.batchExportQA.holdDiscovery = true; });
  await panel.getByRole('button', { name: '开始导出（2）', exact: true }).click();
  await page.waitForFunction(() => window.batchExportQA.discoveryStarted, {}, { polling: 100 });
  await page.evaluate(() => window.batchExportQA.unmount());
  await page.getByText('已返回 Hub', { exact: true }).waitFor();
  await page.evaluate(() => window.batchExportQA.releaseDiscovery());
  await delay(200);
  assert.deepEqual(await page.evaluate(() => window.batchExportQA.events), []);
  assert.deepEqual(errors, []);
  console.log('PASS: batch export supports sequential receipts, stop/resume/cancel, uncertain submission recovery and unmount cleanup.');
  console.log(`Screenshots: ${output}`);
} finally {
  if (app) await app.close();
  await server.close();
}
