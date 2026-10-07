import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const output = resolve('test-results');
await mkdir(output, { recursive: true });
const root = await mkdtemp(join(output, 'ui-smoke-'));
const parent = join(root, '中文 工程'); await mkdir(parent);
const env = { ...process.env, UI_EDITOR_USER_DATA: join(root, 'runtime') }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
const page = await app.firstWindow(), errors = [];
page.setDefaultTimeout(10000);
page.on('pageerror', error => errors.push(error.message));
const file = join(parent, 'UIEditorWorkspace', 'interfaces', '在线奖励.rbxui.json');
async function dialogs(open, save = file, response = 0) {
  await app.evaluate(({ dialog }, options) => {
    dialog.showOpenDialog = async () => ({ canceled: !options.open, filePaths: options.open ? [options.open] : [] });
    dialog.showSaveDialog = async () => ({ canceled: !options.save, filePath: options.save });
    dialog.showMessageBox = async () => ({ response: options.response });
  }, { open, save, response });
}
async function menu(name) { await page.getByRole('button', { name: '文件', exact: true }).click(); await page.getByRole('button', { name, exact: true }).click(); }
async function childMenu(parent) {
  const row = page.getByRole('button', { name: `选择节点 ${parent}`, exact: true }).locator('..');
  await row.hover();
  await row.getByRole('button', { name: `为 ${parent} 添加子节点`, exact: true }).click();
}
async function add(type, parent) {
  await childMenu(parent ?? await page.getByLabel('节点名称', { exact: true }).inputValue());
  await page.getByRole('menuitem', { name: type, exact: true }).click();
  await page.waitForFunction(type => document.querySelector('[aria-label="节点名称"]')?.value === type, type);
}
async function input(label, value) { const field = page.getByLabel(label, { exact: true }); await field.fill(String(value)); await field.press('Tab'); }
async function select(name) { await page.getByRole('button', { name: `选择节点 ${name}`, exact: true }).click(); }
async function openAsset(name) {
  await page.getByRole('button', { name: `UI 资产 ${name}`, exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '打开', exact: true }).click();
}
async function dirty(value) { await page.getByText(value ? '界面有未保存修改' : '界面已保存', { exact: true }).waitFor(); }
async function undo() { await page.locator('.canvas-heading').click(); await page.keyboard.press('Control+z'); }
async function savedDocument() { await menu('保存'); await dirty(false); return JSON.parse(await readFile(file, 'utf8')); }
async function dragNode(source, target, ratio) {
  const sourceRow = page.getByRole('button', { name: `选择节点 ${source}`, exact: true }).locator('..');
  const targetRow = page.getByRole('button', { name: `选择节点 ${target}`, exact: true }).locator('..');
  const from = await sourceRow.boundingBox(), to = await targetRow.boundingBox();
  await page.mouse.move(from.x + 50, from.y + from.height / 2); await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + from.height / 2, { steps: 3 });
  await page.mouse.move(to.x + 70, to.y + to.height * ratio, { steps: 8 });
  await page.mouse.move(to.x + 72, to.y + to.height * ratio);
  await page.mouse.up();
}

try {
  await dialogs(parent);
  await page.getByRole('button', { name: '创建工程', exact: true }).click();
  await page.getByText('请打开一个工程', { exact: true }).waitFor();
  await dialogs(null); await menu('打开界面');
  await page.getByText('请打开一个工程', { exact: true }).waitFor();
  await menu('新建界面');
  await page.getByRole('textbox', { name: '新界面名称', exact: true }).fill('OnlineRewards');
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await page.getByRole('tree', { name: 'Roblox 节点' }).waitFor();
  assert.deepEqual(await page.getByTestId('ui-artboard').evaluate(element => ({ width: element.offsetWidth, height: element.offsetHeight })), { width: 1280, height: 720 });
  await input('界面名称', '在线奖励');
  assert.equal(await page.getByLabel('新增节点类型').count(), 0);
  const rootAdd = page.getByRole('button', { name: '为 ScreenGui 添加子节点', exact: true });
  await page.locator('.canvas-heading').hover();
  assert.equal(await rootAdd.evaluate(button => getComputedStyle(button).opacity), '0');
  await childMenu('ScreenGui');
  assert.equal(await page.getByRole('menuitem', { name: 'UICorner', exact: true }).count(), 0);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('menu', { name: '添加子节点', exact: true }).count(), 0);
  await childMenu('ScreenGui');
  await page.locator('.canvas-heading').click();
  assert.equal(await page.getByRole('menu', { name: '添加子节点', exact: true }).count(), 0);
  await add('Frame'); await input('节点名称', '主面板');
  await input('Size.x.offset', 600); await input('Size.y.offset', 400);
  await input('Position.x.offset', 200); await input('Position.y.offset', 120);
  await add('UICorner');
  assert.equal(await page.locator('[data-class-name="Frame"]').evaluate(element => getComputedStyle(element).borderRadius), '8px');
  assert.equal(await page.getByRole('button', { name: '为 UICorner 添加子节点', exact: true }).count(), 0);
  await childMenu('主面板');
  assert.equal(await page.getByRole('menuitem', { name: 'UICorner', exact: true }).count(), 0);
  assert.equal(await page.getByRole('menuitem', { name: 'UITextSizeConstraint', exact: true }).count(), 0);
  await page.screenshot({ path: join(output, 'node-add-menu.png') });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '折叠 主面板', exact: true }).click();
  // Adding targets the hovered row even while a different node is selected, and expands it.
  await add('TextLabel', '主面板'); await input('节点名称', '标题'); await input('Text', '在线奖励');
  const liveThumbnail = page.getByRole('img', { name: '在线奖励 缩略图', exact: true });
  await liveThumbnail.locator('.preview-text-fill').getByText('在线奖励', { exact: true }).waitFor();
  assert.equal(await liveThumbnail.locator('.node-selection, button').count(), 0);
  await page.getByRole('button', { name: '选择节点 UICorner', exact: true }).waitFor();
  await undo(); await undo(); await undo();
  assert.equal(await page.getByRole('button', { name: '选择节点 TextLabel', exact: true }).count(), 0);
  await page.keyboard.press('Control+y');
  await select('TextLabel'); await input('节点名称', '标题'); await input('Text', '在线奖励');
  await select('主面板'); await add('ImageLabel'); await input('节点名称', '奖励图标'); await input('Position.y.offset', 100);
  assert.ok(await page.getByTestId('ui-artboard').getByText('缺少预览图片', { exact: true }).isVisible());
  const imageFile = join(root, '图标.png');
  await writeFile(imageFile, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6ioAAAAASUVORK5CYII=', 'base64'));
  await dialogs(imageFile); await page.getByRole('button', { name: '选择预览图片', exact: true }).click();
  await page.getByText('图标.png', { exact: true }).waitFor();
  await select('主面板'); await add('TextButton'); await input('节点名称', '领取'); await input('Text', '领取奖励'); await input('Position.y.offset', 260);
  // Tree context save selects the project library without a native file dialog.
  await dialogs(null, null);
  await page.getByRole('button', { name: '选择节点 领取', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '保存…', exact: true }).click();
  await page.getByRole('dialog', { name: '保存UI', exact: true }).getByRole('button', { name: '保存', exact: true }).click();
  await dirty(false);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  await page.getByRole('button', { name: 'UI 资产 在线奖励', exact: true }).waitFor();
  assert.equal(saved.root.children[0].children.length, 4);
  assert.equal(saved.root.children[0].children[2].previewImage.name, '图标.png');
  assert.equal('state' in saved, false); assert.equal('config' in saved, false);
  // Compact icon/name rows and native tree drag, including collapsed destinations.
  assert.equal(await page.locator('.node-select img').count(), 6);
  assert.ok(await page.locator('.node-select img').evaluateAll(icons => icons.every(icon => icon.complete && icon.naturalWidth === 16 && icon.naturalHeight === 16)));
  assert.equal(await page.locator('.node-select small').count(), 0);
  const panelRow = page.getByRole('button', { name: '选择节点 主面板', exact: true }).locator('..');
  const titleRow = page.getByRole('button', { name: '选择节点 标题', exact: true }).locator('..');
  assert.equal(await titleRow.evaluate(row => parseFloat(row.style.paddingLeft)) - await panelRow.evaluate(row => parseFloat(row.style.paddingLeft)), 18);
  await dragNode('领取', '标题', .1); await dirty(true);
  assert.equal((await savedDocument()).root.children[0].children[1].name, '领取');
  await undo(); assert.deepEqual(await savedDocument(), saved);
  await dragNode('标题', '奖励图标', .9);
  assert.equal((await savedDocument()).root.children[0].children[2].name, '标题');
  await undo(); assert.deepEqual(await savedDocument(), saved);
  await dragNode('标题', '领取', .5);
  assert.equal((await savedDocument()).root.children[0].children[2].children[0].name, '标题');
  await undo(); assert.deepEqual(await savedDocument(), saved);
  await dragNode('主面板', '标题', .5); await dirty(false);
  await page.getByRole('button', { name: '折叠 主面板', exact: true }).click();
  await select('ScreenGui'); await add('Frame'); await input('节点名称', '待移入');
  await dragNode('待移入', '主面板', .5);
  await page.getByRole('button', { name: '选择节点 标题', exact: true }).waitFor();
  assert.equal((await savedDocument()).root.children[0].children[4].name, '待移入');
  await undo(); await undo(); await undo(); assert.deepEqual(await savedDocument(), saved);
  await select('领取');
  await dialogs(null, file.replace('.rbxui.json', ''), 1); await menu('另存为');
  await page.waitForFunction(() => !document.querySelector('fieldset')?.disabled);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), saved);

  // Pointer movement is converted through zoom; all move events form one command.
  await page.getByLabel('画布缩放').selectOption('0.5');
  const button = page.locator('[data-class-name="TextButton"]');
  const box = await button.boundingBox();
  await page.mouse.move(box.x + 30, box.y + 20); await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 40, { steps: 6 }); await page.mouse.up();
  assert.equal(Number(await page.getByLabel('Position.x.offset', { exact: true }).inputValue()), 60);
  assert.equal(Number(await page.getByLabel('Position.y.offset', { exact: true }).inputValue()), 300);
  await dirty(true); await undo(); await dirty(false);
  assert.equal(Number(await page.getByLabel('Position.x.offset', { exact: true }).inputValue()), 0);
  await page.keyboard.press('Control+y'); await dirty(true);
  await input('AnchorPoint.x', .5); await input('AnchorPoint.y', .5);
  const beforeResize = await button.boundingBox();
  const handle = page.getByRole('button', { name: '拖动调整尺寸', exact: true });
  const hb = await handle.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 20, hb.y + hb.height / 2 + 10, { steps: 4 }); await page.mouse.up();
  assert.equal(Number(await page.getByLabel('Size.x.offset', { exact: true }).inputValue()), 240);
  const afterResize = await button.boundingBox();
  assert.ok(Math.abs(beforeResize.x - afterResize.x) < 1 && Math.abs(beforeResize.y - afterResize.y) < 1);
  await undo(); assert.equal(Number(await page.getByLabel('Size.x.offset', { exact: true }).inputValue()), 200);
  await undo(); await undo();
  await undo(); await dirty(false);

  assert.equal(await page.locator('.node-actions').count(), 0);
  await select('主面板'); await page.keyboard.press('Control+c'); await dirty(false);
  await select('领取'); await page.keyboard.press('Control+v');
  await page.getByRole('button', { name: '选择节点 主面板 副本', exact: true }).waitFor();
  let pasted = await savedDocument();
  assert.equal(pasted.root.children.length, 1);
  assert.equal(pasted.root.children[0].children[4].name, '主面板 副本');
  assert.notEqual(pasted.root.children[0].children[4].children[0].id, saved.root.children[0].children[0].id);
  await undo(); assert.deepEqual(await savedDocument(), saved);
  await page.keyboard.press('Control+y');
  assert.deepEqual(await savedDocument(), pasted);
  await undo(); assert.deepEqual(await savedDocument(), saved);
  // Input shortcuts must keep native text behavior and leave the node tree unchanged.
  await select('领取'); await page.getByLabel('Text', { exact: true }).focus();
  await page.keyboard.press('Control+d');
  await page.keyboard.press('Control+a'); await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v');
  await page.locator('.canvas-heading').click();
  assert.deepEqual(await savedDocument(), saved);
  // Invalid component paste reports an error without entering history.
  await select('UICorner'); await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v');
  await page.locator('.editor-error[role="alert"]').waitFor(); await dirty(false);
  assert.deepEqual(await savedDocument(), saved);
  // Root shortcuts cannot create siblings or delete the document root.
  await select('ScreenGui'); await page.keyboard.press('Control+v'); await page.keyboard.press('Control+d'); await page.keyboard.press('Delete');
  assert.deepEqual(await savedDocument(), saved);
  await select('主面板'); await page.keyboard.press('Control+d');
  await page.getByRole('button', { name: '选择节点 主面板 副本', exact: true }).waitFor();
  await select('主面板 副本');
  await page.getByLabel('父节点').selectOption(saved.root.children[0].id);
  await page.locator('.canvas-heading').click(); await page.keyboard.press('Delete');
  assert.equal(await page.getByRole('button', { name: '选择节点 主面板 副本', exact: true }).count(), 0);
  await undo(); await select('主面板 副本'); await undo(); await undo(); await dirty(false);

  // Layout owns children positions and grid sizes.
  await select('主面板'); await add('UIGridLayout');
  await select('领取'); assert.ok(await page.getByLabel('Position.x.offset', { exact: true }).isDisabled());
  assert.ok(await page.getByLabel('Size.x.offset', { exact: true }).isDisabled());
  const lockedBox = await button.boundingBox();
  await page.mouse.move(lockedBox.x + 10, lockedBox.y + 10); await page.mouse.down(); await page.mouse.move(lockedBox.x + 30, lockedBox.y + 30); await page.mouse.up();
  await undo(); await dirty(false);

  // Cancelled open, corrupt open, and failed save preserve the document.
  await dialogs(null); await menu('打开界面'); await select('领取');
  const corrupt = join(root, '坏文件.rbxui.json'); await writeFile(corrupt, '{bad');
  await dialogs(corrupt); await menu('打开界面'); await page.locator('.editor-error[role="alert"]').filter({ hasText: 'JSON' }).waitFor();
  assert.equal(await page.getByLabel('节点名称', { exact: true }).inputValue(), '领取');
  await input('Text', '测试保存失败');
  // Force write failure with an actual directory using a complete extension.
  const blocked = join(root, 'blocked.rbxui.json'); await mkdir(blocked);
  await dialogs(null, blocked); await menu('另存为'); await page.locator('.editor-error[role="alert"]').waitFor();
  await dirty(true);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).root.children[0].children[3].properties.Text, '领取奖励');
  await undo(); await dirty(false);

  // Unsaved change prompts: cancellation, save cancellation, then save and switch.
  await input('Text', '领取金币'); await dialogs(null, file, 2); await menu('新建界面'); await page.getByRole('textbox', { name: '新界面名称', exact: true }).fill('SecondInterface'); await page.getByRole('button', { name: '创建', exact: true }).click();
  assert.equal(await page.getByLabel('节点名称', { exact: true }).inputValue(), '领取');
  await dialogs(null, null, 0); await menu('另存为'); await dirty(true);
  await dialogs(null, file, 0); await menu('新建界面'); await page.getByRole('textbox', { name: '新界面名称', exact: true }).fill('SecondInterface'); await page.getByRole('button', { name: '创建', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="界面名称"]')?.value === 'SecondInterface');
  await input('界面名称', '第二个界面');
  await dialogs(null, null, 0); await menu('返回 Hub');
  await page.waitForFunction(() => !document.querySelector('fieldset')?.disabled);
  assert.equal(await page.getByLabel('界面名称', { exact: true }).inputValue(), '第二个界面');
  const secondFile = join(parent, 'UIEditorWorkspace', 'interfaces', '第二个界面.rbxui.json');
  await dialogs(null, null);
  await page.getByRole('button', { name: 'UI 资产 第二个界面（未保存）', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '保存为项目UI', exact: true }).click();
  await dirty(false);
  assert.notEqual(JSON.parse(await readFile(secondFile, 'utf8')).id, saved.id);
  const existing = await readFile(file, 'utf8');
  await input('界面名称', '在线奖励');
  await dialogs(null, null, 1);
  await menu('保存为项目UI');
  await page.waitForFunction(() => !document.querySelector('fieldset')?.disabled);
  await dirty(true);
  assert.equal(await readFile(file, 'utf8'), existing);
  await input('界面名称', '第二个界面');
  await menu('保存为项目UI'); await dirty(false);
  await input('界面名称', '第二个界面修改');
  await dialogs(null, secondFile, 2); await openAsset('在线奖励');
  assert.equal(await page.getByLabel('界面名称', { exact: true }).inputValue(), '第二个界面修改');
  await dialogs(null, secondFile, 1); await openAsset('在线奖励'); await select('领取');
  assert.equal(await page.getByLabel('Text', { exact: true }).inputValue(), '领取金币');
  // Reopening the project rebuilds the asset list from disk.
  await menu('返回 Hub');
  await page.getByRole('button', { name: '打开 中文 工程', exact: true }).click();
  const nestedFile = join(parent, 'UIEditorWorkspace', 'interfaces', 'Templates', 'NestedTemplate.rbxui.json');
  await mkdir(join(parent, 'UIEditorWorkspace', 'interfaces', 'Templates'), { recursive: true });
  await writeFile(nestedFile, JSON.stringify({ ...saved, name: 'NestedTemplate' }));
  await writeFile(join(parent, 'UIEditorWorkspace', 'interfaces', 'Templates', 'Broken.rbxui.json'), '{bad');
  // Re-entering the project discovers nested assets and opens them through the card.
  await menu('返回 Hub');
  await page.getByRole('button', { name: '打开 中文 工程', exact: true }).click();
  const savedThumbnail = page.getByRole('img', { name: 'NestedTemplate 缩略图', exact: true });
  await savedThumbnail.locator('.preview-text-fill').getByText('领取奖励', { exact: true }).waitFor();
  await page.getByRole('img', { name: 'Broken 缩略图', exact: true }).getByText('预览不可用', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('界面名称', { exact: true }).count(), 0);
  assert.equal(await savedThumbnail.locator('[role="button"], .node-selection').count(), 0);
  const filters = await page.locator('filter').evaluateAll(elements => elements.map(element => element.id));
  assert.equal(new Set(filters).size, filters.length);
  const outsidePreview = await page.evaluate(path => window.documents.previewAsset(path), join(root, 'outside.rbxui.json'));
  assert.equal(outsidePreview.ok, false);
  await page.locator('.document-assets').screenshot({ path: join(output, 'ui-asset-thumbnails.png') });
  await openAsset('NestedTemplate');
  await page.waitForFunction(() => document.querySelector('[aria-label="界面名称"]')?.value === 'NestedTemplate');
  assert.equal(await page.getByLabel('界面名称', { exact: true }).inputValue(), 'NestedTemplate');
  await select('领取');
  assert.equal(await page.getByLabel('Text', { exact: true }).inputValue(), '领取奖励');
  await openAsset('在线奖励'); await select('领取');
  assert.equal(await page.getByLabel('Text', { exact: true }).inputValue(), '领取金币');
  await page.getByRole('button', { name: '适应窗口', exact: true }).click();
  await page.screenshot({ path: join(output, 'roblox-static-ui.png') });
  // Only the main canvas becomes interactive during a running preview.
  await page.getByRole('button', { name: '运行', exact: true }).click();
  await page.getByTestId('ui-artboard').getByRole('button', { name: '领取', exact: true }).waitFor();
  assert.equal(await page.locator('.ui-document-thumbnail [role="button"], .ui-document-thumbnail .node-selection').count(), 0);
  await page.getByRole('button', { name: '停止', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('fieldset')?.disabled);

  // The real native close event must respect cancel and save.
  await input('Text', '关闭前保存'); await dialogs(null, file, 2);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await page.waitForFunction(() => !document.querySelector('fieldset')?.disabled);
  assert.equal(page.isClosed(), false);
  await dialogs(null, file, 0);
  const closed = page.waitForEvent('close');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await closed;
  assert.equal(JSON.parse(await readFile(file, 'utf8')).root.children[0].children[3].properties.Text, '关闭前保存');
  assert.deepEqual(errors, []);
  console.log('PASS: Roblox canvas, nodes, properties, image, zoom drag, single-command undo, resize, hierarchy, layout lock, JSON save/load, cancelled/corrupt open, save failure, dirty prompts, native close cleanup.');
} finally {
  if (!page.isClosed()) {
    await page.screenshot({ path: join(output, 'ui-last-state.png') }).catch(() => {});
    await app.evaluate(({ app }) => app.exit()).catch(() => {});
  }
  await app.close();
}
