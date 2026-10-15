import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { robloxStrategy as strategy } from '../src/editor/roblox';
import { dim2 } from '../src/shared/uiDocument';

const output = resolve('test-results');
await mkdir(output, { recursive: true });
const temporary = await mkdtemp(join(output, 'symbols-'));
const parent = join(temporary, 'project'); await mkdir(parent);
const document = strategy.createDocument('Symbols');
for (const [index, className] of ['TextLabel', 'TextButton', 'TextBox'].entries()) {
  const node = strategy.createNode(className); node.name = className;
  node.properties.Text = className === 'TextBox' ? '' : '\uE002 100 金币';
  if (className === 'TextBox') node.properties.PlaceholderText = '\uE002 价格';
  node.properties.TextSize = 32;
  node.properties.Position = dim2(100, 80 + index * 100);
  node.properties.Size = dim2(360, 80);
  document.root.children.push(node);
}
const file = join(temporary, 'Symbols.rbxui.json');
await writeFile(file, JSON.stringify(document));
const env: Record<string, string> = { ...process.env, UI_EDITOR_BACKGROUND: '1', UI_EDITOR_USER_DATA: join(temporary, 'runtime') };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
const page = await app.firstWindow(); page.setDefaultTimeout(10000);
const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
try {
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, parent);
  await page.getByRole('button', { name: '创建工程', exact: true }).click();
  await page.getByRole('dialog', { name: '创建工程', exact: true }).getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByText('请打开一个工程', { exact: true }).waitFor();
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, file);
  await page.getByRole('button', { name: '文件', exact: true }).click();
  await page.getByRole('button', { name: '打开界面', exact: true }).click();
  await page.getByRole('button', { name: '选择节点 TextLabel', exact: true }).click();
  assert.equal(await page.evaluate(async () => (await window.document.fonts.load('32px "Roblox Symbols"', '\uE002')).length), 1);
  const art = page.getByTestId('ui-artboard');
  assert.equal(await art.locator('.preview-text-fill').count(), 3);
  for (const text of await art.locator('.preview-text-fill').all()) {
    assert.ok((await text.textContent())?.includes('\uE002'));
    assert.match(await text.evaluate(el => getComputedStyle(el).fontFamily), /Roblox Symbols/);
  }
  // Replace a selected range while preserving an uncommitted input draft.
  const field = page.getByLabel('Text', { exact: true });
  await field.fill('Buy XX 100');
  await field.evaluate(el => (el as HTMLInputElement).setSelectionRange(4, 6));
  await page.getByRole('button', { name: '插入 Robux 图标', exact: true }).click();
  assert.equal(await field.inputValue(), 'Buy \uE002 100');
  await field.press('Tab');
  await page.getByRole('button', { name: '选择节点 TextLabel', exact: true }).click();
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => (window.document.querySelector('[aria-label="Text"]') as HTMLInputElement)?.value === '\uE002 100 金币');
  await page.keyboard.press('Control+y');
  await page.waitForFunction(() => (window.document.querySelector('[aria-label="Text"]') as HTMLInputElement)?.value === 'Buy \uE002 100');
  await page.screenshot({ path: join(output, 'text-symbols.png') });
  assert.deepEqual(errors, []);
  console.log('PASS: bundled font loads, mixed symbols and placeholder preview, selected-range insertion, draft preservation, undo/redo.');
} finally { await app.evaluate(({ app }) => app.exit()).catch(() => {}); }
