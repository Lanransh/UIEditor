import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

await mkdir(resolve('test-results'), { recursive: true });
const root = await mkdtemp(resolve('test-results/template-assets-'));
const first = join(root, '工程A'), second = join(root, '工程B');
await mkdir(first); await mkdir(second);
const runtime = join(root, 'runtime');
const env = { ...process.env, UI_EDITOR_USER_DATA: runtime }; delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const errors = [];
const templateFile = join(runtime, 'template-references', 'TemplateDemo.rbxui.json');
const projectFile = parent => join(parent, 'UIEditorWorkspace', 'interfaces', 'TemplateDemo.rbxui.json');
const textOf = document => document.root.children[0].children[0].properties.Text;

async function launch() {
  app = await electron.launch({ args: ['.'], env });
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
}
async function dialogs(parent = first, response = 0) {
  await app.evaluate(({ dialog }, options) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [options.parent] });
    dialog.showSaveDialog = async () => ({ canceled: true });
    dialog.showMessageBox = async () => ({ response: options.response });
  }, { parent, response });
}
async function menu(name) {
  await page.getByRole('button', { name: '文件', exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
}
async function input(label, value) {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(value); await field.press('Tab');
}
async function add(type, parent) {
  await page.getByRole('button', { name: `为 ${parent} 添加子节点`, exact: true }).click();
  await page.getByRole('menuitem', { name: type, exact: true }).click();
  await page.waitForFunction(type => document.querySelector('[aria-label="节点名称"]')?.value === type, type);
}
async function idle() { await page.waitForFunction(() => !document.querySelector('fieldset')?.disabled); }
async function treeSave(target) {
  await page.getByRole('button', { name: '选择节点 TextLabel', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '保存…', exact: true }).click();
  await page.getByLabel('保存到', { exact: true }).selectOption(target);
  await page.getByRole('dialog', { name: '保存UI', exact: true }).getByRole('button', { name: '保存', exact: true }).click();
  await idle();
}
async function preview(text) {
  await page.getByRole('img', { name: 'TemplateDemo 缩略图', exact: true }).locator('.preview-text-fill').getByText(text, { exact: true }).waitFor();
}
async function openCopy() {
  await page.getByRole('button', { name: 'UI 资产 TemplateDemo', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '打开副本', exact: true }).click();
  await idle();
}
async function move(target) {
  await page.getByRole('button', { name: 'UI 资产 TemplateDemo', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '移动', exact: true }).click();
  await page.getByRole('menuitem', { name: target, exact: true }).click();
  await idle();
}

try {
  await launch(); await dialogs();
  await page.getByRole('button', { name: '创建工程', exact: true }).click();
  await page.getByText('请打开一个工程', { exact: true }).waitFor();
  await menu('新建界面');
  await page.getByRole('textbox', { name: '新界面名称', exact: true }).fill('TemplateDemo');
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await page.getByRole('tree', { name: 'Roblox 节点' }).waitFor();
  await input('界面名称', 'TemplateDemo');
  await add('Frame', 'ScreenGui'); await add('TextLabel', 'Frame');
  await input('Text', '原始项目');
  await menu('保存为项目UI');
  await page.getByText('界面已保存', { exact: true }).waitFor();
  const projectBefore = await readFile(projectFile(first), 'utf8');
  await input('Text', '参考快照');
  await menu('保存为模板参考'); await idle();
  assert.equal(await readFile(projectFile(first), 'utf8'), projectBefore);
  await page.getByText('界面有未保存修改', { exact: true }).waitFor();
  assert.equal(textOf(JSON.parse(await readFile(templateFile, 'utf8'))), '参考快照');

  await page.getByRole('button', { name: '模板参考', exact: true }).click();
  await preview('参考快照');
  assert.equal(await page.getByRole('button', { name: /（未保存）/ }).count(), 0);
  await menu('保存'); await page.getByText('界面已保存', { exact: true }).waitFor();
  assert.equal(textOf(JSON.parse(await readFile(projectFile(first), 'utf8'))), '参考快照');

  const referenceBefore = await readFile(templateFile, 'utf8');
  await input('Text', '更新参考');
  await dialogs(first, 1);
  assert.equal(await page.getByRole('button', { name: '保存当前UI为模板参考', exact: true }).count(), 0);
  await treeSave('templates');
  assert.equal(await readFile(templateFile, 'utf8'), referenceBefore);
  await page.getByText('界面有未保存修改', { exact: true }).waitFor();
  await dialogs();
  await treeSave('templates');
  await preview('更新参考');
  const reference = await readFile(templateFile, 'utf8');
  await page.getByRole('button', { name: '＋ 新建文件夹', exact: true }).click();
  await page.getByLabel('文件夹名称', { exact: true }).fill('奖励界面');
  await page.getByRole('dialog', { name: '新建模板文件夹', exact: true }).getByRole('button', { name: '创建', exact: true }).click();
  await page.getByLabel('浏览模板文件夹', { exact: true }).getByRole('option', { name: '奖励界面', exact: true }).waitFor({ state: 'attached' });
  await page.getByRole('button', { name: '选择节点 TextLabel', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '保存…', exact: true }).click();
  await page.getByLabel('保存到', { exact: true }).selectOption('templates');
  await page.getByLabel('模板文件夹', { exact: true }).selectOption('奖励界面');
  await page.getByRole('dialog', { name: '保存UI', exact: true }).getByRole('button', { name: '保存', exact: true }).click();
  await idle(); await preview('更新参考');
  assert.equal(await readFile(join(runtime, 'template-references', '奖励界面', 'TemplateDemo.rbxui.json'), 'utf8'), reference);
  const invalidFolder = await page.evaluate(() => window.documents.createTemplateFolder('../escape'));
  assert.equal(invalidFolder.ok, false);
  const duplicateFolder = await page.evaluate(() => window.documents.createTemplateFolder('奖励界面'));
  assert.equal(duplicateFolder.ok, false);
  await page.getByLabel('浏览模板文件夹', { exact: true }).selectOption('');

  await dialogs(second, 1); await menu('返回 Hub');
  await page.getByRole('button', { name: '创建工程', exact: true }).click();
  await page.getByText('请打开一个工程', { exact: true }).waitFor();
  await page.getByRole('button', { name: '模板参考', exact: true }).click();
  await preview('更新参考');
  assert.equal(await page.getByLabel('界面名称', { exact: true }).count(), 0);
  const rejected = await page.evaluate(path => window.documents.previewAsset(path, 'templates'), projectFile(first));
  assert.equal(rejected.ok, false);
  await openCopy();
  await page.waitForFunction(() => document.querySelector('[aria-label="界面名称"]')?.value === 'TemplateDemo');
  await page.getByText('新界面尚未保存', { exact: true }).waitFor();
  await page.getByRole('button', { name: '选择节点 TextLabel', exact: true }).click();
  await input('Text', '工程B副本');
  await menu('保存为项目UI'); await page.getByText('界面已保存', { exact: true }).waitFor();
  assert.equal(textOf(JSON.parse(await readFile(projectFile(second), 'utf8'))), '工程B副本');
  assert.equal(await readFile(templateFile, 'utf8'), reference);
  await preview('更新参考');

  await input('Text', '取消打开');
  await dialogs(second, 2); await openCopy();
  assert.equal(await page.getByLabel('Text', { exact: true }).inputValue(), '取消打开');
  await dialogs(second, 1); await menu('返回 Hub');
  await page.getByRole('button', { name: '创建工程', exact: true }).waitFor();
  await app.evaluate(({ app }) => app.exit());
  await app.close(); app = null;
  // Runtime assets survive a full app restart, not just workspace switching.
  await launch(); await dialogs(second);
  await page.getByRole('button', { name: '打开 工程B', exact: true }).click();
  await page.getByRole('button', { name: '模板参考', exact: true }).click();
  await preview('更新参考');
  await page.getByRole('region', { name: '底部面板', exact: true }).screenshot({ path: resolve('test-results/template-reference-library.png') });
  assert.equal(await readFile(templateFile, 'utf8'), reference);

  // Moving removes the source, retains bytes and rejects a colliding destination.
  await page.getByRole('button', { name: 'UI 资产 TemplateDemo', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '移动', exact: true }).click();
  await page.getByRole('menu', { name: '移动UI', exact: true }).screenshot({ path: resolve('test-results/ui-asset-move-menu.png') });
  await page.keyboard.press('Escape');
  assert.equal(await readFile(templateFile, 'utf8'), reference);
  await move('永久UI');
  const permanentFile = join(runtime, 'ui-assets', 'TemplateDemo.rbxui.json');
  assert.equal(await readFile(permanentFile, 'utf8'), reference);
  await assert.rejects(readFile(templateFile), { code: 'ENOENT' });
  await page.getByRole('button', { name: '永久UI', exact: true }).click();
  await preview('更新参考');
  await move('项目UI');
  await page.locator('.editor-error').getByText('目标文件夹已有同名UI，请先改名后再移动。', { exact: true }).waitFor();
  assert.equal(await readFile(permanentFile, 'utf8'), reference);
  assert.equal(textOf(JSON.parse(await readFile(projectFile(second), 'utf8'))), '工程B副本');

  // The active document follows its moved path, retaining pending edits and history.
  await menu('新建界面');
  await page.getByRole('textbox', { name: '新界面名称', exact: true }).fill('Untitled');
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await page.getByRole('button', { name: '项目UI', exact: true }).click();
  await page.getByRole('button', { name: 'UI 资产 Untitled（未保存）', exact: true }).click({ button: 'right' });
  assert.equal(await page.getByRole('menuitem', { name: '移动', exact: true }).isEnabled(), false);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'UI 资产 TemplateDemo', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '打开', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="界面名称"]')?.value === 'TemplateDemo');
  await page.getByRole('button', { name: '选择节点 TextLabel', exact: true }).click();
  await input('Text', '移动中未保存');
  await move('模板参考');
  await page.getByText('界面有未保存修改', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Text', { exact: true }).inputValue(), '移动中未保存');
  await assert.rejects(readFile(projectFile(second)), { code: 'ENOENT' });
  assert.equal(textOf(JSON.parse(await readFile(templateFile, 'utf8'))), '工程B副本');
  await page.locator('.canvas-heading').click();
  await page.keyboard.press('Control+z');
  await page.getByText('界面已保存', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Text', { exact: true }).inputValue(), '工程B副本');
  await page.keyboard.press('Control+y');
  await page.getByText('界面有未保存修改', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Text', { exact: true }).inputValue(), '移动中未保存');
  await menu('保存'); await page.getByText('界面已保存', { exact: true }).waitFor();
  assert.equal(textOf(JSON.parse(await readFile(templateFile, 'utf8'))), '移动中未保存');
  await assert.rejects(readFile(projectFile(second)), { code: 'ENOENT' });
  await page.getByRole('button', { name: '永久UI', exact: true }).click();
  await move('项目UI');
  assert.equal(await readFile(projectFile(second), 'utf8'), reference);
  await assert.rejects(readFile(permanentFile), { code: 'ENOENT' });
  const outsideMove = await page.evaluate(path => window.documents.moveAsset(path, 'project', 'permanent'), projectFile(first));
  assert.equal(outsideMove.ok, false);
  assert.deepEqual(errors, []);
  console.log('PASS: template snapshots, cross-project copies, persistence, thumbnails, moves between all libraries, collision safety, source validation and active-document save-path tracking.');
} finally {
  if (app) {
    if (page && !page.isClosed()) await page.screenshot({ path: resolve('test-results/template-reference-last-state.png') }).catch(() => {});
    await app.evaluate(({ app }) => app.exit()).catch(() => {});
    await app.close();
  }
}
