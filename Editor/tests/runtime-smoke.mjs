import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const packaged = process.argv.includes('--packaged');
await mkdir(resolve('test-results'), { recursive: true });
const root = await mkdtemp(resolve('test-results/runtime-smoke-'));
const parent = join(root, 'project'); await mkdir(parent);
const file = join(parent, 'UIEditorWorkspace/interfaces/reward.rbxui.json');
const env = { ...process.env, UI_EDITOR_USER_DATA: join(root, 'runtime') }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch(packaged
  ? { executablePath: resolve('../ToolRuntime/UIEditor-win32-x64/UIEditor.exe'), env }
  : { args: ['.'], env });
try {
  const page = await app.firstWindow();
  if (packaged) await page.context().setOffline(true);
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => { window.confirm = () => true; });
  await app.evaluate(({ dialog }, options) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [options.parent] });
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: options.file });
    dialog.showMessageBox = async () => ({ response: 0 });
  }, { parent, file });
  await page.getByRole('button', { name: '创建工程', exact: true }).click();
  await page.getByRole('button', { name: '脚本', exact: true }).click();
  await page.getByRole('button', { name: '载入奖励示例', exact: true }).click();
  await page.getByRole('button', { name: '文件', exact: true }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByText('界面已保存', { exact: true }).waitFor();
  const saved = JSON.parse(await readFile(file, 'utf8'));
  const original = await readFile(file, 'utf8');
  assert.equal(saved.version, 2);
  assert.match(saved.scripts.source, /function UI:Render/);
  for (let cycle = 0; cycle < 2; cycle++) {
    await page.getByRole('button', { name: '运行', exact: true }).click();
    const button = page.getByRole('button', { name: '领取奖励', exact: true });
    await button.waitFor();
    await page.waitForFunction(() => document.querySelector('[role="button"][aria-label="领取奖励"]')?.getAttribute('aria-disabled') === 'true');
    assert.equal(await button.getAttribute('aria-disabled'), 'true');
    assert.equal(await page.locator('.node-selection').count(), 0);
    assert.equal(await page.getByRole('button', { name: '适应窗口', exact: true }).isEnabled(), true);
    await page.getByRole('button', { name: '界面脚本', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: '界面基类脚本', exact: true }).getAttribute('readonly'), '');
    await page.getByRole('button', { name: '模拟状态', exact: true }).click();
    const state = page.getByRole('textbox', { name: '模拟状态 JSON' });
    await state.fill('{broken');
    await page.getByRole('button', { name: '应用到运行会话' }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByRole('button', { name: '停止', exact: true }).isEnabled(), true);
    await state.fill(JSON.stringify({ Status: 'Claimable', RemainingSeconds: 0, Pending: false }));
    await page.getByRole('button', { name: '应用到运行会话' }).click();
    await page.waitForFunction(() => document.querySelector('[role="button"][aria-label="领取奖励"]')?.getAttribute('aria-disabled') === 'false');
    try { await button.click(); } catch (error) {
      console.log('Runtime click geometry', await button.boundingBox(), await page.locator('.canvas-viewport').boundingBox(), await page.evaluate(() => ({ width: innerWidth, height: innerHeight })));
      await page.screenshot({ path: resolve('test-results/runtime-click-failure.png') });
      throw error;
    }
    await page.getByRole('button', { name: '运行日志' }).click();
    await page.getByRole('log').getByText(/ClaimReward.*online_5min/).waitFor();
    assert.equal(await page.getByRole('log').locator('.action').count(), 1);
    await page.getByRole('button', { name: '重置', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[role="button"][aria-label="领取奖励"]')?.getAttribute('aria-disabled') === 'true');
    await page.getByRole('button', { name: '停止', exact: true }).click();
    await page.getByRole('button', { name: '运行', exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.getByRole('button', { name: '领取奖励', exact: true }).count(), 0);
    assert.equal(await readFile(file, 'utf8'), original);
  }
  await page.getByRole('button', { name: '界面脚本', exact: true }).click();
  const source = page.getByRole('textbox', { name: '界面基类脚本', exact: true });
  await source.fill('function UI:Render(state)\n error("smoke-error")\nend');
  await page.getByRole('button', { name: '运行', exact: true }).click();
  await page.getByRole('log').getByText(/interface:2.*smoke-error/).waitFor();
  assert.equal(await page.getByRole('button', { name: '运行', exact: true }).isEnabled(), true);
  await page.getByRole('button', { name: '界面脚本', exact: true }).click();
  assert.equal(await source.getAttribute('readonly'), null);
  await source.fill(saved.scripts.source);
  await page.getByRole('button', { name: '运行', exact: true }).click();
  await page.getByRole('button', { name: '领取奖励', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('[role="button"][aria-label="领取奖励"]')?.getAttribute('aria-disabled') === 'true');
  await page.screenshot({ path: resolve(`test-results/${packaged ? 'packaged-' : ''}runtime.png`) });
  await page.getByRole('button', { name: '停止', exact: true }).click();
  assert.deepEqual(errors, []);
  console.log(`PASS: ${packaged ? 'packaged offline' : 'development'} Luau, button action, live data, invalid JSON, reset, errors, read-only design, clean stop.`);
} finally { await app.close(); }
