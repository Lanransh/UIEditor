import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { listDocumentAssets, readDocument, writeDocument } from '../electron/documents';
import { robloxStrategy } from '../src/editor/roblox';

const output = resolve('test-results');
await mkdir(output, { recursive: true });
const root = await mkdtemp(join(output, 'project-template-clone-'));
const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), UI_EDITOR_BACKGROUND: '1', UI_EDITOR_USER_DATA: join(root, 'runtime') };
delete env.ELECTRON_RUN_AS_NODE;
const application: ElectronApplication = await electron.launch({ args: ['.'], env });
const page: Page = await application.firstWindow();
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));

async function pick(path: string | null) {
  await application.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: path === null, filePaths: path ? [path] : [] });
  }, path);
}
async function create() {
  await page.getByRole('button', { name: '创建工程', exact: true }).click();
}
async function hub() {
  await page.getByRole('button', { name: '文件', exact: true }).click();
  await page.getByRole('button', { name: '返回 Hub', exact: true }).click();
  await page.getByRole('heading', { name: '选择工程', exact: true }).waitFor();
}
const dialog = page.getByRole('dialog', { name: '创建工程', exact: true });
try {
  await page.getByText('还没有打开过工程，创建你的第一个 Roblox 工程吧。').waitFor();
  const sourceParent = join(root, '来源 工程');
  await mkdir(sourceParent);
  await pick(sourceParent);
  await create();
  await dialog.getByRole('radio', { name: '空白工程（不使用风格）', exact: true }).waitFor();
  await dialog.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByText('请打开一个工程', { exact: true }).waitFor();
  assert.equal(await dialog.count(), 0);
  const source = join(sourceParent, 'UIEditorWorkspace');
  const document = robloxStrategy.createDocument('Reward');
  await writeDocument(join(source, 'template-references', '奖励', 'Reward.rbxui.json'), document);
  await writeDocument(join(source, 'interfaces', 'ProjectOnly.rbxui.json'), document);
  await hub();

  await create();
  await dialog.waitFor();
  assert.ok(await dialog.getByRole('radio', { name: '空白工程（不使用风格）', exact: true }).isChecked());
  assert.equal(await dialog.getByRole('combobox').count(), 0);
  assert.ok(!(await dialog.innerText()).includes(source));
  await dialog.getByRole('button', { name: '取消' }).click();
  assert.equal(await dialog.count(), 0);
  await create();
  await dialog.press('Escape');
  assert.equal(await dialog.count(), 0);
  await pick(null);
  await create();
  await dialog.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '创建工程', exact: true }).waitFor({ state: 'visible' });

  const emptyParent = join(root, '空白工程');
  await mkdir(emptyParent);
  await pick(emptyParent);
  await create();
  await dialog.getByRole('button', { name: '下一步' }).click();
  await page.getByText('请打开一个工程', { exact: true }).waitFor();
  assert.deepEqual(await listDocumentAssets(join(emptyParent, 'UIEditorWorkspace'), 'templates'), []);
  await hub();

  const cloneParent = join(root, '克隆工程');
  await mkdir(cloneParent);
  await pick(cloneParent);
  await create();
  await dialog.getByRole('radio', { name: '来源 工程', exact: true }).check();
  assert.ok(await dialog.getByRole('radio', { name: '来源 工程', exact: true }).isChecked());
  assert.ok(!(await dialog.innerText()).includes(source));
  await page.screenshot({ path: join(root, 'clone-dialog.png') });
  await dialog.getByRole('button', { name: '下一步' }).click();
  await page.getByText('请打开一个工程', { exact: true }).waitFor();
  const clone = join(cloneParent, 'UIEditorWorkspace');
  assert.deepEqual(await readDocument(join(clone, 'template-references', '奖励', 'Reward.rbxui.json')), document);
  assert.ok(!(await readdir(clone)).includes('interfaces'));
  await page.getByRole('button', { name: '模板参考', exact: true }).click();
  await page.getByRole('button', { name: 'UI 资产 Reward', exact: true }).waitFor();
  assert.deepEqual(await readDocument(join(source, 'template-references', '奖励', 'Reward.rbxui.json')), document);
  await hub();
  const unknownSource = await page.evaluate(path => window.projects.create(path), join(root, 'unknown', 'UIEditorWorkspace'));
  assert.ok(!unknownSource.ok && unknownSource.error.includes('最近列表中找不到'));
  const failedParent = join(root, '损坏模板目标');
  await mkdir(failedParent);
  await writeFile(join(source, 'template-references', 'Broken.rbxui.json'), '{bad');
  await pick(failedParent);
  await create();
  await dialog.getByRole('radio', { name: '来源 工程', exact: true }).check();
  await dialog.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('alert').filter({ hasText: 'JSON' }).waitFor();
  assert.deepEqual(await readdir(failedParent), []);
  assert.deepEqual(errors, []);
  console.log('PASS: 首次显示来源选择、有历史时可选克隆、默认空白、取消/Escape、目录选择取消、模板独立复制及资产显示、拒绝未知来源、损坏模板提示及清理。');
  console.log(`Screenshot: ${join(root, 'clone-dialog.png')}`);
} finally {
  await application.close();
}
