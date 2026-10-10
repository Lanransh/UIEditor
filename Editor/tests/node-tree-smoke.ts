import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { robloxStrategy as strategy } from '../src/editor/roblox';

const output = resolve('test-results');
await mkdir(output, { recursive: true });
const temporary = await mkdtemp(join(output, 'node-tree-'));
const parent = join(temporary, 'project');
await mkdir(parent);
const document = strategy.createDocument();
document.name = 'TreeTest';
document.root.name = 'TreeTest';
const panel = strategy.createNode('Frame'); panel.name = 'Panel';
const group = strategy.createNode('Frame'); group.name = 'RewardGroup';
const leaf = strategy.createNode('TextLabel'); leaf.name = 'RewardTitle';
const other = strategy.createNode('Frame'); other.name = 'OtherPanel';
const otherLeaf = strategy.createNode('TextLabel'); otherLeaf.name = 'OtherTitle';
group.children.push(leaf); panel.children.push(group); other.children.push(otherLeaf);
document.root.children.push(panel, other);
const file = join(temporary, 'TreeTest.rbxui.json');
const original = JSON.stringify(document);
await writeFile(file, original);
const env: Record<string, string> = { ...process.env, UI_EDITOR_BACKGROUND: '1', UI_EDITOR_USER_DATA: join(temporary, 'runtime') };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
const page = await app.firstWindow();
page.setDefaultTimeout(10000);
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
const node = (name: string) => page.getByRole('button', { name: `选择节点 ${name}`, exact: true });
async function action(name: string, label: string) {
  await node(name).click({ button: 'right' });
  await page.getByRole('menuitem', { name: label, exact: true }).click();
}
try {
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, parent);
  await page.getByRole('button', { name: '创建工程', exact: true }).click();
  await page.getByRole('dialog', { name: '创建工程', exact: true }).getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByText('请打开一个工程', { exact: true }).waitFor();
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, file);
  await page.getByRole('button', { name: '文件', exact: true }).click();
  await page.getByRole('button', { name: '打开界面', exact: true }).click();
  await node('RewardTitle').waitFor();
  assert.equal(await page.getByRole('button', { name: '展开所有节点树', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '收起所有节点树', exact: true }).count(), 0);
  await action('Panel', '收起子节点');
  assert.equal(await node('RewardGroup').count(), 0);
  await page.getByRole('button', { name: '展开 Panel', exact: true }).click();
  await node('RewardTitle').waitFor(); // Nonrecursive collapse preserves descendant state.
  await action('Panel', '展开子节点');
  await node('RewardGroup').waitFor();
  assert.equal(await node('RewardTitle').count(), 0);
  await node('OtherTitle').waitFor(); // The other branch is unaffected.
  await action('Panel', '展开子节点(递归)');
  await node('RewardTitle').waitFor();
  await action('Panel', '收起子节点(递归)');
  await page.getByRole('button', { name: '展开 Panel', exact: true }).click();
  await node('RewardGroup').waitFor();
  assert.equal(await node('RewardTitle').count(), 0);
  await action('Panel', '收起子节点');
  const search = page.getByRole('searchbox', { name: '搜索节点名称', exact: true });
  await search.fill('  wArDtI  ');
  await node('RewardTitle').waitFor(); // Substring, case folding, ancestors, and closed paths.
  await node('Panel').waitFor(); await node('RewardGroup').waitFor(); await node('TreeTest').waitFor();
  assert.equal(await node('OtherPanel').count(), 0);
  await search.fill('找不到的节点');
  await page.getByRole('status').getByText('没有匹配的节点', { exact: true }).waitFor();
  assert.equal(await page.getByRole('treeitem').count(), 0);
  await search.press('Escape');
  await node('OtherTitle').waitFor();
  await node('RewardTitle').click({ button: 'right' });
  assert.equal(await page.getByRole('menuitem', { name: '展开子节点', exact: true }).count(), 0);
  await page.keyboard.press('Escape');
  await node('Panel').click({ button: 'right' });
  await page.screenshot({ path: join(output, 'node-tree-context.png') });
  await page.keyboard.press('Escape');
  await search.fill('reward');
  await page.screenshot({ path: join(output, 'node-tree-search.png') });
  await page.getByText('界面已保存', { exact: true }).waitFor();
  assert.equal(await readFile(file, 'utf8'), original);
  assert.deepEqual(errors, []);
  console.log('PASS: node name filtering, ancestor paths, empty and cleared search, one-level and recursive expansion/collapse, isolated branches, unchanged document.');
} finally {
  await app.evaluate(({ app }) => app.exit()).catch(() => {});
  await app.close();
}
