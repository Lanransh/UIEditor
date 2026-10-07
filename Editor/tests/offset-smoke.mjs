import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const output = resolve('test-results');
await mkdir(output, { recursive: true });
const root = await mkdtemp(join(output, 'offset-smoke-'));
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
async function undo() { await page.locator('.canvas-heading').click(); await page.keyboard.press('Control+z'); }

try {
  await dialogs(parent);
  await page.getByRole('button', { name: '创建工程', exact: true }).click();
  await page.getByRole('dialog', { name: '创建工程', exact: true }).getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByText('请打开一个工程', { exact: true }).waitFor();
  await dialogs(null); await menu('打开界面');
  await page.getByText('请打开一个工程', { exact: true }).waitFor();
  await menu('新建界面');
  await page.getByRole('textbox', { name: '新界面名称', exact: true }).fill('OnlineRewards');
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await page.getByRole('tree', { name: 'Roblox 节点' }).waitFor();
  assert.deepEqual(await page.getByTestId('ui-artboard').evaluate(element => ({ width: element.offsetWidth, height: element.offsetHeight })), { width: 1280, height: 720 });

  await add('ImageButton');
  await input('TileSize.x.offset', 28.125);
  assert.match(await page.locator('.editor-error[role="alert"]').innerText(), /ImageButton.TileSize.*Offset 必须是整数/);
  assert.equal(await page.getByLabel('TileSize.x.offset', {exact:true}).inputValue(), '0');
  await input('TileSize.x.offset', 28); await input('TileSize.x.scale', .125);
  assert.equal(await page.locator('.editor-error[role="alert"]').count(), 0);
  assert.equal(await page.getByLabel('TileSize.x.scale', {exact:true}).inputValue(), '0.125');
  await input('AnchorPoint.x', .5); await input('AnchorPoint.y', .5);
  await page.getByLabel('画布缩放').selectOption('1');
  const handle=await page.getByRole('button', {name:'拖动调整尺寸',exact:true}).boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2); await page.mouse.down();
  await page.mouse.move(handle.x+handle.width/2+5,handle.y+handle.height/2+3); await page.mouse.up();
  assert.equal(await page.getByLabel('Size.x.offset', {exact:true}).inputValue(), '205');
  for(const axis of ['x','y']) assert.ok(Number.isInteger(Number(await page.getByLabel('Position.'+axis+'.offset',{exact:true}).inputValue())));
  await undo();
  assert.equal(await page.getByLabel('Size.x.offset', {exact:true}).inputValue(), '200');
  assert.deepEqual(errors, []);
  console.log('PASS: Offset error, original value retained, fractional Scale, integer resize compensation and undo');
} finally { await app.close(); }
