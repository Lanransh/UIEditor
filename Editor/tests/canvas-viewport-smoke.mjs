import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';

await mkdir('test-results', { recursive: true });
const root = await mkdtemp(resolve('test-results/canvas-viewport-'));
const parent = join(root, 'project'); await mkdir(parent);
const env = { ...process.env, UI_EDITOR_BACKGROUND: '1', UI_EDITOR_USER_DATA: join(root, 'runtime') }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
const page = await app.firstWindow(), errors = [];
page.setDefaultTimeout(10000);
page.on('pageerror', error => errors.push(error.message));
const viewport = page.locator('.canvas-viewport'), artboard = page.getByTestId('ui-artboard'), zoom = page.getByRole('combobox', { name: '画布缩放' });
const close = (actual, expected, tolerance = 1) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
async function wheel(delta) {
  const before = await zoom.inputValue();
  await page.mouse.wheel(0, delta);
  if ((delta < 0 && Number(before) > .1) || (delta > 0 && Number(before) < 1)) await page.waitForFunction(before => document.querySelector('[aria-label="画布缩放"]').value !== before, before, { polling: 100 });
  else await page.waitForTimeout(100);
}
async function settled(level, padding = 0) {
  await page.waitForFunction(({ level, padding }) => {
    const area = document.querySelector('.canvas-viewport'), board = document.querySelector('.ui-artboard');
    const scale = Math.min((area.clientWidth - padding) / 1280, (area.clientHeight - padding) / 720) / level;
    return document.querySelector('[aria-label="画布缩放"]').value === String(level) && Math.abs(new DOMMatrix(getComputedStyle(board).transform).a - scale) < .00001;
  }, { level, padding }, { polling: 100 });
}
async function fitted() {
  await page.waitForFunction(() => {
    const area = document.querySelector('.canvas-viewport'), board = document.querySelector('.ui-artboard');
    const a = area.getBoundingClientRect(), b = board.getBoundingClientRect();
    const scale = Math.min(area.clientWidth / 1280, area.clientHeight / 720);
    return Math.abs(b.width - 1280 * scale) < 1 && Math.abs(b.height - 720 * scale) < 1 && Math.abs(b.x - a.x - (area.clientWidth - b.width) / 2) < 1 && Math.abs(b.y - a.y - (area.clientHeight - b.height) / 2) < 1;
  }, undefined, { polling: 100 });
  const area = await viewport.boundingBox(), board = await artboard.boundingBox();
  const scale = Math.min(area.width / 1280, area.height / 720);
  close(board.width, 1280 * scale); close(board.height, 720 * scale);
  close(board.x, area.x + (area.width - board.width) / 2); close(board.y, area.y + (area.height - board.height) / 2);
  assert.equal(await zoom.inputValue(), '1');
}
try {
  await app.evaluate(({ dialog }, parent) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [parent] }); }, parent);
  await page.getByRole('button', { name: '创建工程', exact: true }).click();
  await page.getByRole('dialog', { name: '创建工程', exact: true }).getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('button', { name: '文件', exact: true }).click();
  await page.getByRole('button', { name: '新建界面', exact: true }).click();
  await page.getByRole('textbox', { name: '新界面名称', exact: true }).fill('ViewportTest');
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await artboard.waitFor();
  await fitted(); console.log('Checked initial fit');
  assert.ok((await zoom.locator('option').evaluateAll(options => options.map(option => Number(option.value)))).every(value => value <= 1));

  const before = await artboard.boundingBox(), area = await viewport.boundingBox();
  const pointer = { x: area.x + area.width * .37, y: area.y + area.height * .43 };
  await page.mouse.move(pointer.x, pointer.y); await wheel(-100);
  const after = await artboard.boundingBox();
  close((pointer.x - before.x) / before.width, (pointer.x - after.x) / after.width, .001);
  close((pointer.y - before.y) / before.height, (pointer.y - after.y) / after.height, .001);
  assert.ok(after.width > before.width, 'Wheel zooms in while the displayed percentage decreases');
  await wheel(100); await wheel(100); await wheel(100);
  assert.equal(await zoom.inputValue(), '1', 'Wheel zoom stops at 100%');

  await zoom.selectOption('0.1');
  await settled(.1);
  const focused = await artboard.boundingBox();
  close(focused.width / before.width, 10, .01);
  close(focused.height / before.height, 10, .01);
  assert.ok(focused.width > area.width && focused.height > area.height, '10% fills the viewport with a cropped region');
  await wheel(-100); assert.equal(await zoom.inputValue(), '0.1');
  await page.getByRole('button', { name: '适应窗口', exact: true }).click(); await fitted();
  console.log('Checked wheel and zoom limits');
  const rootRow = page.getByRole('button', { name: '选择节点 ScreenGui', exact: true }).locator('..');
  await rootRow.hover(); await rootRow.getByRole('button', { name: '为 ScreenGui 添加子节点', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Frame', exact: true }).click();
  const fields = ['Position.x.offset', 'Position.y.offset', 'Size.x.offset', 'Size.y.offset'];
  const values = await Promise.all(fields.map(name => page.getByLabel(name, { exact: true }).inputValue()));
  for (const target of [page.locator('.ui-artboard [data-class-name="Frame"]'), page.getByRole('button', { name: '拖动调整尺寸' })]) {
    const box = await target.boundingBox(), old = await artboard.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2 + 24, { steps: 4 });
    await page.mouse.up({ button: 'middle' });
    const next = await artboard.boundingBox(); close(next.x - old.x, 35); close(next.y - old.y, 24);
    assert.deepEqual(await Promise.all(fields.map(name => page.getByLabel(name, { exact: true }).inputValue())), values, 'Middle drag leaves node properties unchanged');
  }
  await page.getByRole('button', { name: '适应窗口', exact: true }).click();
  console.log('Checked middle pan');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 900));
  await page.waitForFunction(() => innerWidth === 1600, undefined, { polling: 100 });
  await page.waitForTimeout(100);
  await fitted();
  await zoom.selectOption('0.5');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1400, 850));
  await page.waitForFunction(() => innerWidth === 1400, undefined, { polling: 100 });
  await page.waitForTimeout(100);
  assert.equal(await zoom.inputValue(), '0.5', 'Resize preserves relative zoom');

  console.log('Checked resize');
  await settled(.5);
  const exportButton = page.getByRole('button', { name: '导出', exact: true });
  const buttonBox = await exportButton.boundingBox(), toolbar = await page.locator('.runtime-toolbar').boundingBox();
  assert.ok(toolbar.x + toolbar.width - buttonBox.x - buttonBox.width < 20);
  await exportButton.click(); await page.getByRole('dialog', { name: '导出到 Roblox', exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  console.log('Checked export dialog');
  const editStyle = await artboard.getAttribute('style');
  await page.getByRole('button', { name: '运行', exact: true }).click();
  await page.getByRole('button', { name: '停止', exact: true }).waitFor();
  assert.equal(await exportButton.count(), 0);
  await page.getByRole('button', { name: '重置', exact: true }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('.runtime-toolbar button[title="重新开始，恢复初始状态"]')?.disabled, undefined, { polling: 100 });
  console.log('Runtime ready');
  await settled(1, 48);
  const runStyle = await artboard.getAttribute('style');
  await viewport.hover(); await page.mouse.wheel(0, 100);
  await page.waitForTimeout(100);
  assert.equal(await artboard.getAttribute('style'), runStyle, 'Runtime wheel keeps the fitted viewport');
  await page.getByRole('button', { name: '停止', exact: true }).click(); await exportButton.waitFor();
  console.log('Stopped runtime', await zoom.inputValue());
  await page.waitForFunction(() => document.querySelector('[aria-label="画布缩放"]').value === '0.5', undefined, { polling: 100 });
  assert.equal(await zoom.inputValue(), '0.5');
  await settled(.5);
  assert.equal(await artboard.getAttribute('style'), editStyle);
  assert.deepEqual(errors, []);
  console.log('PASS: fitted 100%, pointer wheel zoom, zoom limits, middle pan on nodes/handles, resize, export label and runtime viewport restoration.');
} finally {
  await page.screenshot({ path: join(root, 'canvas.png') }).catch(() => {});
  await app.evaluate(({ app }) => app.exit()).catch(() => {});
  await app.close();
}
