import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

await mkdir(resolve('test-results'), { recursive: true });
const output = await mkdtemp(resolve('test-results/style-library-'));
const env = { ...process.env, UI_EDITOR_BACKGROUND: '1', UI_EDITOR_USER_DATA: join(output, 'runtime') };
delete env.ELECTRON_RUN_AS_NODE;
delete env.UI_EDITOR_OPEN_WORKSPACE;
const app = await electron.launch({ args: ['.'], env });
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('heading', { name: '选择工程', exact: true }).waitFor();
  const history = await page.evaluate(() => window.projects.listRecent());
  await page.getByRole('button', { name: '画风库', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '画风库', exact: true });
  const templates = dialog.getByRole('navigation', { name: '画风模板列表' });
  await templates.getByRole('button', { name: /CloseButton/ }).waitFor();
  await dialog.getByRole('button', { name: '刷新', exact: true }).waitFor({ state: 'visible' });
  const result = await page.evaluate(() => window.projects.previewStyle('多彩棋格风格'));
  assert.ok(result.ok, result.error);
  const source = result.value;
  assert.equal(source.directory, resolve('../TemplateStyles/多彩棋格风格'));
  assert.equal(await templates.getByRole('button').count(), 7);
  const paths = ['AGENTS.md', 'Game-DESIGN.md', ...source.templates.map(template => join('template-references', template.path))];
  const original = await Promise.all(paths.map(path => readFile(join(source.directory, path))));
  await dialog.getByText('已有工程使用独立副本，不会随画风库更新。', { exact: true }).waitFor();
  await dialog.getByText(source.directory, { exact: true }).waitFor();
  for (const template of source.templates) {
    await templates.getByRole('button', { name: `${template.path.replace(/\.rbxui\.json$/i, '')} ${template.document.name} · ${template.path}`, exact: true }).click();
    await page.waitForFunction(id => document.querySelector('[data-testid="style-preview-artboard"]')?.getAttribute('data-document-id') === id, template.document.id);
    assert.equal(await dialog.getByRole('button', { name: '运行', exact: true }).count(), 0);
  }
  await templates.getByRole('button', { name: /CloseButton/ }).click();
  const zoom = dialog.getByLabel('画风预览缩放');
  await page.waitForFunction(() => Number(document.querySelector('[aria-label="画风预览缩放"]')?.value) > 1);
  const focused = await dialog.locator('.style-preview-frame').boundingBox();
  assert.ok(focused.width > 150 && focused.width <= 336, `小组件应聚焦放大：${focused.width}`);
  await zoom.selectOption('0.5');
  assert.equal((await dialog.locator('.style-preview-frame').boundingBox()).width, 42);
  await zoom.selectOption('4');
  assert.equal((await dialog.locator('.style-preview-frame').boundingBox()).width, 336);
  await dialog.getByRole('button', { name: '适应窗口', exact: true }).click();
  await dialog.getByRole('button', { name: '刷新', exact: true }).click();
  await templates.getByRole('button', { name: /CloseButton/ }).waitFor();
  await page.waitForFunction(() => document.querySelector('.style-preview-toolbar strong')?.textContent === 'CloseButton');
  await page.waitForFunction(() => Number(document.querySelector('[aria-label="画风预览缩放"]')?.value) > 1);
  assert.equal(await templates.getByRole('button', { name: /CloseButton/ }).getAttribute('aria-pressed'), 'true');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(output, 'close-button.png') });
  await templates.getByRole('button', { name: /SmallWindow\.rbxui\.json/ }).click();
  await page.waitForFunction(() => document.querySelector('.style-preview-toolbar strong')?.textContent === 'SmallWindow');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: join(output, 'small-window.png') });
  for (let i = 0; i < paths.length; i++) assert.deepEqual(await readFile(join(source.directory, paths[i])), original[i], paths[i]);
  assert.deepEqual(await page.evaluate(() => window.projects.listRecent()), history);
  await assert.rejects(async () => {
    const invalid = await page.evaluate(() => window.projects.previewStyle('../outside'));
    if (!invalid.ok) throw new Error(invalid.error);
  }, /标识无效/);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '画风库', exact: true }).click();
  await templates.getByRole('button', { name: /CloseButton/ }).waitFor();

  // Isolated handler responses exercise empty, unavailable and retry UI states.
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('project:list-styles');
    ipcMain.handle('project:list-styles', () => ({ ok: true, value: [] }));
  });
  await dialog.getByRole('button', { name: '刷新', exact: true }).click();
  await dialog.getByText(/暂无画风/).waitFor();
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('project:list-styles');
    ipcMain.handle('project:list-styles', () => ({ ok: false, error: '测试：目录访问受限' }));
  });
  await dialog.getByRole('button', { name: '刷新', exact: true }).click();
  await dialog.getByRole('alert').getByText('测试：目录访问受限', { exact: true }).waitFor();
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('project:list-styles');
    ipcMain.handle('project:list-styles', () => ({ ok: true, value: [{ id: '坏画风', name: '坏画风', description: '', templateCount: 0, problem: '测试：模板损坏' }] }));
    ipcMain.removeHandler('project:preview-style');
    ipcMain.handle('project:preview-style', () => { throw new Error('不可用画风不应请求预览'); });
  });
  await dialog.getByRole('button', { name: '刷新', exact: true }).click();
  await templates.getByRole('alert').getByText('测试：模板损坏', { exact: true }).waitFor();
  await app.evaluate(({ ipcMain }, source) => {
    ipcMain.removeHandler('project:list-styles');
    ipcMain.handle('project:list-styles', () => ({ ok: true, value: [{ id: '恢复画风', name: '恢复画风', description: '', templateCount: source.templates.length }] }));
    ipcMain.removeHandler('project:preview-style');
    ipcMain.handle('project:preview-style', () => ({ ok: false, error: '测试：模板读取失败' }));
  }, source);
  await dialog.getByRole('button', { name: '刷新', exact: true }).click();
  await templates.getByRole('alert').getByText('测试：模板读取失败', { exact: true }).waitFor();
  await app.evaluate(({ ipcMain }, source) => {
    ipcMain.removeHandler('project:preview-style');
    ipcMain.handle('project:preview-style', () => ({ ok: true, value: source }));
  }, source);
  await dialog.getByRole('button', { name: '刷新', exact: true }).click();
  await templates.getByRole('button', { name: /CloseButton/ }).waitFor();
  assert.deepEqual(errors, []);
  await writeFile(join(output, 'results.json'), JSON.stringify({ templates: source.templates.length, errors, checks: ['focus', 'zoom', 'refresh', 'readonly', 'source', 'empty', 'unavailable', 'retry', 'path-validation'] }, null, 2));
  console.log(`画风库 smoke passed; screenshots: ${output}`);
} finally {
  await app.evaluate(({ app }) => app.exit()).catch(() => {});
  await app.close();
}
