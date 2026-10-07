import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { readTemplateStyle, projectStylePath } from '../electron/template-styles';

const packaged = process.argv.includes('--packaged');
const executable = process.env.UI_EDITOR_PACKAGED_EXECUTABLE ?? resolve(process.env.UI_EDITOR_PACKAGE_OUTPUT || '../ToolRuntime', 'UIEditor-win32-x64', 'UIEditor.exe');
await mkdir(resolve('test-results'), { recursive: true });
const root = await mkdtemp(resolve('test-results/project-style-'));
const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), UI_EDITOR_BACKGROUND: '1', UI_EDITOR_USER_DATA: join(root, 'runtime') };
delete env.ELECTRON_RUN_AS_NODE;
delete env.UI_EDITOR_OPEN_WORKSPACE;
let application!: ElectronApplication;
let page!: Page;
const errors: string[] = [];
async function launch() {
  application = await electron.launch(packaged ? { executablePath: executable, args: [], env } : { args: ['.'], env });
  page = await application.firstWindow();
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('heading', { name: '选择工程', exact: true }).waitFor();
}
async function pick(path: string | null) {
  await application.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: path === null, filePaths: path ? [path] : [] });
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  }, path);
}
async function createDialog() {
  await page.getByRole('button', { name: '创建工程', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '创建工程', exact: true });
  await dialog.getByRole('radio', { name: /多彩棋格风格/ }).waitFor();
  return dialog;
}
async function hub() {
  await page.getByRole('button', { name: '文件', exact: true }).click();
  await page.getByRole('button', { name: '返回 Hub', exact: true }).click();
  await page.getByRole('heading', { name: '选择工程', exact: true }).waitFor();
}
async function screenshot(name: string) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const png = await application.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const [width, height] = window.getContentSize();
    const image = await window.webContents.capturePage({ x: 0, y: 0, width, height }, { stayHidden: true, stayAwake: true });
    return image.toPNG().toString('base64');
  });
  await writeFile(join(root, name), Buffer.from(png, 'base64'));
}

await launch();
try {
  const styles = await page.evaluate(() => window.projects.listStyles());
  assert.ok(styles.ok);
  const style = styles.value.find(item => item.id === '多彩棋格风格')!;
  assert.ok(style && !style.problem);
  assert.equal(style.templateCount, 7);
  assert.equal(style.preview?.root.name, 'SmallWindowUI');
  const library = packaged ? join(dirname(executable), 'resources', 'TemplateStyles') : resolve('../TemplateStyles');
  const snapshot = await readTemplateStyle(join(library, '多彩棋格风格'));
  const source = join(root, '风格项目');
  await mkdir(source);
  const workspace = join(source, 'UIEditorWorkspace');
  await pick(source);
  let dialog = await createDialog();
  assert.ok(await dialog.getByRole('radio', { name: '空白工程（不使用风格）', exact: true }).isChecked());
  assert.ok((await dialog.innerText()).includes('设计规范、AI 提示词'));
  assert.equal(await dialog.getByRole('radio').count(), 2, 'first creation offers blank + complete style, no recent source');
  const thumbnail = dialog.getByRole('img', { name: '多彩棋格风格 缩略图', exact: true });
  await thumbnail.locator('.ui-thumbnail-artboard').waitFor();
  assert.ok(await thumbnail.locator('.preview-text-fill').getByText('SMALL', { exact: true }).isVisible());
  const bounds = await thumbnail.boundingBox();
  assert.ok(bounds && bounds.width >= 120 && bounds.height >= 70);
  await thumbnail.click();
  assert.ok(await dialog.getByRole('radio', { name: /多彩棋格风格/ }).isChecked(), 'thumbnail clicks select its style');
  // CDP screenshots can stall for a packaged, intentionally hidden window.
  // Capture without exposing or focusing the window, using Electron's API.
  await screenshot('style-dialog.png');
  await dialog.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByText('请打开一个工程', { exact: true }).waitFor();
  for (const file of snapshot.files) assert.deepEqual(await readFile(join(workspace, projectStylePath(file.path))), file.content, file.path);
  assert.ok((await readdir(workspace)).includes('interfaces'));
  await page.getByRole('button', { name: '模板参考', exact: true }).click();
  await page.getByRole('button', { name: 'UI 资产 SmallWindow', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'UI 资产 TemplatePage', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'UI 资产 SmallWindow', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '打开副本', exact: true }).click();
  const artboard = page.getByTestId('ui-artboard');
  const title = artboard.locator('.preview-text-fill').getByText('SMALL', { exact: true });
  await title.waitFor();
  await page.getByRole('button', { name: '选择节点 TitleBox', exact: true }).waitFor();
  assert.equal(await title.evaluate(element => getComputedStyle(element).color), 'rgb(255, 255, 255)');
  assert.equal(await artboard.locator('.preview-text-stroke').count(), 2, '标题与关闭按钮保留白字描边');
  assert.equal(await page.getByRole('button', { name: '选择节点 BackgroundImg', exact: true }).count(), 0);
  await screenshot('style-window.png');
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  });
  await hub();

  dialog = await createDialog();
  await dialog.getByRole('radio', { name: /多彩棋格风格/ }).check();
  await dialog.getByRole('radio', { name: '风格项目', exact: true }).check();
  assert.equal(await dialog.getByRole('radio', { name: /多彩棋格风格/ }).isChecked(), false);
  await dialog.getByRole('radio', { name: /多彩棋格风格/ }).check();
  assert.equal(await dialog.getByRole('radio', { name: '风格项目', exact: true }).isChecked(), false);
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await page.getByRole('dialog').count(), 0);
  dialog = await createDialog();
  await dialog.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  await pick(null);
  dialog = await createDialog();
  await dialog.getByRole('radio', { name: /多彩棋格风格/ }).check();
  await dialog.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('button', { name: '创建工程', exact: true }).waitFor({ state: 'visible' });

  const agents = join(workspace, 'AgentWorkspace', 'AGENTS.md');
  await writeFile(agents, '# 用户的项目定制入口\n绝不覆盖。');
  // Choosing a style for an already-existing project must only open it.
  await pick(source);
  dialog = await createDialog();
  await dialog.getByRole('radio', { name: /多彩棋格风格/ }).check();
  await dialog.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByText('请打开一个工程', { exact: true }).waitFor();
  assert.equal(await readFile(agents, 'utf8'), '# 用户的项目定制入口\n绝不覆盖。');
  await hub();
  await application.close();
  await launch();
  await pick(workspace);
  await page.getByRole('button', { name: '打开工程', exact: true }).click();
  await page.getByText('请打开一个工程', { exact: true }).waitFor();
  assert.equal(await readFile(agents, 'utf8'), '# 用户的项目定制入口\n绝不覆盖。');
  await hub();
  const unknown = await page.evaluate(() => window.projects.create({ kind: 'style', id: '../outside' }));
  assert.ok(!unknown.ok && unknown.error.includes('标识无效'));
  const both = await page.evaluate(() => window.projects.create({ kind: 'style', id: '多彩棋格风格', path: 'other' } as never));
  assert.ok(!both.ok && both.error.includes('不能同时'));
  for (const file of snapshot.files) assert.deepEqual(await readFile(join(library, '多彩棋格风格', file.path)), file.content);
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(window => !window.isVisible() && !window.isFocused())), true);
  assert.deepEqual(errors, []);
  console.log(`PASS: ${packaged ? '打包版' : '开发版'}风格发现、首次选择、7 模板与规范/skills 完整复制、互斥来源、取消/Escape、已有工程与重开定制保护、库不变、无展示页、后台窗口。`);
  console.log(`Screenshot: ${join(root, 'style-dialog.png')}`);
  console.log(`Template screenshot: ${join(root, 'style-window.png')}`);
} finally { await application.close(); }
