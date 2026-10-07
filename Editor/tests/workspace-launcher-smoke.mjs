import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';

const output = resolve('test-results');
await mkdir(output, { recursive: true });
const root = await mkdtemp(join(output, 'launcher-smoke-'));
const workspace = join(root, 'UIEditorWorkspace');
const env = { ...process.env, UI_EDITOR_USER_DATA: join(root, 'runtime') };
delete env.ELECTRON_RUN_AS_NODE;
delete env.UI_EDITOR_OPEN_WORKSPACE;
let application;
try {
  application = await electron.launch({ args: ['.'], env });
  let page = await application.firstWindow();
  await page.getByRole('heading', { name: '选择工程', exact: true }).waitFor();
  await application.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, root);
  await page.getByRole('button', { name: '创建工程', exact: true }).click();
  await page.getByText('请打开一个工程', { exact: true }).waitFor();
  assert.equal(await readFile(join(workspace, '.gitignore'), 'utf8'), '/Run.bat\n');
  assert.ok((await readFile(join(workspace, 'Run.bat'), 'utf8')).includes('UI_EDITOR_OPEN_WORKSPACE=%~dp0'));
  await application.close();
  application = null;
  await writeFile(join(workspace, '.gitignore'), '# keep\n/Run.bat\n');
  application = await electron.launch({ args: ['.'], env: { ...env, UI_EDITOR_OPEN_WORKSPACE: workspace } });
  page = await application.firstWindow();
  await page.getByText('请打开一个工程', { exact: true }).waitFor();
  assert.equal(await readFile(join(workspace, '.gitignore'), 'utf8'), '# keep\n/Run.bat\n');
  await page.getByRole('button', { name: '文件', exact: true }).click();
  await page.getByRole('button', { name: '返回 Hub', exact: true }).click();
  await page.getByRole('heading', { name: '选择工程', exact: true }).waitFor();
  const executable = await application.evaluate(() => process.execPath);
  const child = spawn(executable, ['.'], {
    cwd: process.cwd(), env: { ...env, UI_EDITOR_OPEN_WORKSPACE: workspace }, windowsHide: true, stdio: 'ignore',
  });
  const exited = new Promise((done, reject) => { child.once('error', reject); child.once('exit', code => code === 0 ? done() : reject(new Error(`Second instance exited ${code}`))); });
  await page.getByText('请打开一个工程', { exact: true }).waitFor();
  await exited;
  console.log('PASS: 创建工作区生成文件、启动直达工程、保留忽略规则、已有实例接收工作区。');
} finally {
  if (application) await application.close();
}
