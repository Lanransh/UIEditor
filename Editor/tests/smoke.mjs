import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const output = resolve('test-results');
await mkdir(output, { recursive: true });
const root = await mkdtemp(join(output, 'smoke-'));
const parent = join(root, '中文 工程');
await mkdir(parent);
const runtime = join(root, 'runtime');
const env = { ...process.env, UI_EDITOR_USER_DATA: runtime };
delete env.ELECTRON_RUN_AS_NODE;
const errors = [];
let application;
let page;
async function launch() {
  application = await electron.launch({ args: ['.'], env });
  page = await application.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('heading', { name: '选择工程', exact: true }).waitFor();
  await page.getByRole('button', { name: '创建工程', exact: true }).waitFor();
}
// Native OS dialogs cannot be driven by Playwright. Substitute only their return
// values in the actual Electron main process; real IPC and file operations still run.
async function dialogResult(path, response = 0) {
  await application.evaluate(({ dialog }, value) => {
    dialog.showOpenDialog = async () => ({ canceled: !value.path, filePaths: value.path ? [value.path] : [] });
    dialog.showMessageBox = async () => ({ response: value.response, checkboxChecked: false });
  }, { path, response });
}
async function clickReady(name) {
  if (name === '返回 Hub') await page.getByRole('button', { name: '文件', exact: true }).click();
  const button = page.getByRole('button', { name, exact: true });
  await button.click();
}
async function checkWorkspaceLayout() {
  const tree = await page.getByRole('complementary', { name: '节点树', exact: true }).boundingBox();
  const canvas = await page.getByRole('region', { name: '空画布', exact: true }).boundingBox();
  const properties = await page.getByRole('complementary', { name: '属性面板', exact: true }).boundingBox();
  const assets = await page.getByRole('region', { name: '资产目录', exact: true }).boundingBox();
  assert.ok(tree && canvas && properties && assets);
  assert.ok(tree.x + tree.width <= canvas.x);
  assert.ok(canvas.x + canvas.width <= properties.x);
  assert.ok(assets.y >= Math.max(tree.y + tree.height, canvas.y + canvas.height, properties.y + properties.height));
  assert.equal(assets.width, await page.evaluate(() => innerWidth));
}
async function checkWorkspaceResize() {
  const cases = [
    ['调整节点树宽度', page.getByRole('complementary', { name: '节点树', exact: true }), 'width', 80, 0],
    ['调整属性面板宽度', page.getByRole('complementary', { name: '属性面板', exact: true }), 'width', -80, 0],
    ['调整资产目录高度', page.getByRole('region', { name: '资产目录', exact: true }), 'height', 0, -60],
  ];
  for (const [name, panel, dimension, dx, dy] of cases) {
    const divider = page.getByRole('separator', { name, exact: true });
    const before = (await panel.boundingBox())[dimension];
    for (const direction of [1, -1]) {
      const box = await divider.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + dx * direction, box.y + box.height / 2 + dy * direction, { steps: 5 });
      await page.mouse.up();
      const expected = before + (direction === 1 ? Math.abs(dx || dy) : 0);
      await page.waitForFunction(({ name, expected }) => Number(document.querySelector(`[role="separator"][aria-label="${name}"]`).getAttribute('aria-valuenow')) === Math.round(expected), { name, expected }, { timeout: 5000 });
      assert.ok(Math.abs((await panel.boundingBox())[dimension] - expected) < 1);
      await checkWorkspaceLayout();
    }
  }
  const treeDivider = page.getByRole('separator', { name: '调整节点树宽度' });
  const before = Number(await treeDivider.getAttribute('aria-valuenow'));
  await treeDivider.press('ArrowRight');
  assert.equal(Number(await treeDivider.getAttribute('aria-valuenow')), before + 10);
  await treeDivider.press('ArrowLeft');
  // Drag well past the canvas: pointer capture must keep resizing and stop at the limit.
  for (const [name, , , dx, dy] of cases) {
    const divider = page.getByRole('separator', { name, exact: true });
    const box = await divider.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(dx > 0 ? 2000 : dx < 0 ? -1000 : box.x + box.width / 2, dy < 0 ? -1000 : box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    assert.equal(await divider.getAttribute('aria-valuenow'), await divider.getAttribute('aria-valuemax'));
    await checkWorkspaceLayout();
  }
  assert.equal(await page.locator('.workspace.resizing').count(), 0);
  const canvas = await page.getByRole('region', { name: '空画布' }).boundingBox();
  assert.ok(canvas.width >= 240 && canvas.height >= 180);
}
try {
  await launch();
  await page.getByText('还没有打开过工程，创建你的第一个 Roblox 工程吧。').waitFor();
  await page.screenshot({ path: join(output, 'hub-empty.png') });
  await dialogResult(null);
  await clickReady('创建工程');
  await page.getByRole('heading', { name: '选择工程', exact: true }).waitFor();
  await dialogResult(parent);
  await clickReady('创建工程');
  await page.getByRole('heading', { name: '从这里开始设计' }).waitFor();
  assert.ok(await page.getByText('未选择节点', { exact: true }).isVisible());
  await page.getByRole('heading', { name: '资产目录', exact: true }).waitFor();
  await checkWorkspaceLayout();
  const libraries = page.getByRole('navigation', { name: '资产库', exact: true });
  assert.equal(await libraries.getByRole('button', { name: '项目资产', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('status').filter({ hasText: '暂无项目资产' }).waitFor();
  await libraries.getByRole('button', { name: '永久资产', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '暂无永久资产' }).waitFor();
  assert.equal(await libraries.getByRole('button', { name: '项目资产', exact: true }).getAttribute('aria-pressed'), 'false');
  assert.equal(await libraries.getByRole('button', { name: '永久资产', exact: true }).getAttribute('aria-pressed'), 'true');
  await libraries.getByRole('button', { name: '项目资产', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '暂无项目资产' }).waitFor();
  await clickReady('编辑');
  assert.ok(await page.getByRole('button', { name: /^撤销/ }).isDisabled());
  assert.ok(await page.getByRole('button', { name: /^重做/ }).isDisabled());
  await page.getByRole('button', { name: '编辑', exact: true }).press('Escape');
  assert.equal(await page.getByRole('button', { name: '返回 Hub', exact: true }).isVisible(), false);
  await clickReady('文件');
  await page.getByRole('button', { name: '返回 Hub', exact: true }).waitFor();
  await page.getByRole('button', { name: '文件', exact: true }).press('Escape');
  assert.equal(await page.getByRole('button', { name: '返回 Hub', exact: true }).isVisible(), false);
  const workspace = join(parent, 'UIEditorWorkspace');
  const manifest = JSON.parse(await readFile(join(workspace, 'project.json'), 'utf8'));
  assert.equal(manifest.mode, 'roblox');
  await page.screenshot({ path: join(output, 'workspace.png') });
  await checkWorkspaceResize();
  await page.screenshot({ path: join(output, 'workspace-resized.png') });
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 600));
  await page.waitForFunction(() => innerWidth <= 900);
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await checkWorkspaceLayout();
  const smallCanvas = await page.getByRole('region', { name: '空画布' }).boundingBox();
  assert.ok(smallCanvas.width >= 240 && smallCanvas.height >= 180);
  await page.screenshot({ path: join(output, 'workspace-small.png') });
  const fixture = await build({ entryPoints: ['tests/fixtures/history.tsx'], bundle: true, write: false, format: 'iife', jsx: 'automatic' });
  await page.evaluate(fixture.outputFiles[0].text);
  async function historyState(value, undo, redo) {
    await page.waitForFunction(expected => document.querySelector('[aria-label="历史状态"]')?.textContent === expected, JSON.stringify([value, undo, redo]));
  }
  await historyState(0, false, false);
  await clickReady('测试连续编辑');
  await historyState(2, true, false);
  await clickReady('测试撤销');
  await historyState(1, true, true);
  await page.keyboard.press('Control+z');
  await historyState(0, false, true);
  await page.keyboard.press('Control+y');
  await historyState(1, true, true);
  await page.keyboard.press('Control+Shift+z');
  await historyState(2, true, false);
  await page.keyboard.press('Meta+z');
  await historyState(1, true, true);
  for (const flags of [{ isComposing: true }, { repeat: true }, { altKey: true }, { handled: true }]) {
    assert.equal(await page.evaluate(flags => {
      const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, cancelable: true, ...flags });
      if (flags.handled) event.preventDefault();
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }, flags), !!flags.handled);
    await historyState(1, true, true);
  }
  for (const name of ['测试文本', '测试富文本']) {
    await page.getByLabel(name, { exact: true }).focus();
    await page.keyboard.press('Control+z');
    await historyState(1, true, true);
  }
  await clickReady('测试编辑');
  await historyState(2, true, false);
  await clickReady('测试清空');
  await historyState(2, false, false);
  await clickReady('测试编辑');
  await clickReady('测试加载');
  await historyState(10, false, false);
  await clickReady('测试编辑');
  await clickReady('测试切换工程');
  await historyState(0, false, false);
  await clickReady('结束历史测试');
  await clickReady('返回 Hub');
  assert.equal(await page.evaluate(() => !window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, cancelable: true }))), false);
  await page.getByRole('button', { name: '打开 中文 工程', exact: true }).waitFor();
  await page.screenshot({ path: join(output, 'hub-recent.png') });
  await application.close();
  await launch();
  await clickReady('打开 中文 工程');
  await page.getByRole('heading', { name: '从这里开始设计' }).waitFor();
  await clickReady('返回 Hub');
  await dialogResult(parent, 1);
  await clickReady('创建工程');
  await page.getByRole('heading', { name: '选择工程', exact: true }).waitFor();
  await dialogResult(parent, 0);
  await clickReady('创建工程');
  await page.getByRole('heading', { name: '从这里开始设计' }).waitFor();
  assert.equal(JSON.parse(await readFile(join(workspace, 'project.json'), 'utf8')).id, manifest.id);
  await clickReady('返回 Hub');
  await dialogResult(workspace);
  await clickReady('打开工程');
  await page.getByRole('heading', { name: '从这里开始设计' }).waitFor();
  await clickReady('返回 Hub');
  await page.getByRole('button', { name: '打开 中文 工程', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '打开 中文 工程', exact: true }).count(), 1);
  const invalidParent = join(root, 'invalid');
  const invalid = join(invalidParent, 'UIEditorWorkspace');
  await mkdir(invalid, { recursive: true });
  await writeFile(join(invalid, 'project.json'), '{bad');
  await dialogResult(invalid);
  await clickReady('打开工程');
  await page.getByRole('alert').filter({ hasText: '损坏' }).waitFor();
  await page.screenshot({ path: join(output, 'hub-error.png') });
  await rename(parent, join(root, 'moved'));
  await clickReady('打开 中文 工程');
  await page.getByRole('alert').filter({ hasText: '不存在' }).waitFor();
  await page.getByText(/工程不可用/).waitFor();
  await clickReady('移出历史 中文 工程');
  await page.getByText('还没有打开过工程，创建你的第一个 Roblox 工程吧。').waitFor();
  assert.equal(JSON.parse(await readFile(join(root, 'moved', 'UIEditorWorkspace', 'project.json'), 'utf8')).id, manifest.id);
  assert.deepEqual(errors, []);
  console.log('PASS: Hub, cancellation, create/open, restart, duplicate creation, missing/corrupt projects, remove history, Chinese paths, panel dragging, keyboard resize, size limits, window resize, history menu, React history, undo/redo shortcuts, text input protection, clear/reset, session isolation, listener cleanup.');
  console.log(`Screenshots: ${output}`);
} finally { if (application) await application.close(); }
