import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';

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
  await page.getByRole('heading', { name: '工程目录', exact: true }).waitFor();
  assert.ok(await page.getByRole('button', { name: '编辑', exact: true }).isDisabled());
  assert.equal(await page.getByRole('button', { name: '返回 Hub', exact: true }).isVisible(), false);
  await clickReady('文件');
  await page.getByRole('button', { name: '返回 Hub', exact: true }).waitFor();
  await page.getByRole('button', { name: '文件', exact: true }).press('Escape');
  assert.equal(await page.getByRole('button', { name: '返回 Hub', exact: true }).isVisible(), false);
  const workspace = join(parent, 'UIEditorWorkspace');
  const manifest = JSON.parse(await readFile(join(workspace, 'project.json'), 'utf8'));
  assert.equal(manifest.mode, 'roblox');
  await page.screenshot({ path: join(output, 'workspace.png') });
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 600));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: join(output, 'workspace-small.png') });
  await clickReady('返回 Hub');
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
  console.log('PASS: Hub, cancellation, create/open, restart, duplicate creation, missing/corrupt projects, remove history, Chinese paths, resize.');
  console.log(`Screenshots: ${output}`);
} finally { if (application) await application.close(); }
