import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createProject } from '../electron/projects';
import { writeDocument, documentScriptPaths } from '../electron/documents';
import { robloxStrategy } from '../src/editor/roblox';
import { callTool } from '../mcp/server';

await mkdir(resolve('test-results'), { recursive: true });
const root = await mkdtemp(resolve('test-results/document-delete-'));
const project = (await createProject(root)).project;
const runtime = join(root, 'runtime'), discovery = join(runtime, 'ui-editor-automation.json');
const paths = {
  Current: join(project.path, 'interfaces', 'Current', 'Current.json'),
  Other: join(project.path, 'interfaces', 'Other', 'Other.json'),
  Template: join(project.path, 'styles', 'templates', 'Template', 'Template.json'),
  Permanent: join(runtime, 'ui-assets', 'Permanent', 'Permanent.json'),
};
const documents = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([name, path]) => {
  const document = robloxStrategy.createDocument(name); await writeDocument(path, document); return [name, document];
})));
const env: Record<string, string> = { ...process.env, UI_EDITOR_USER_DATA: runtime, UI_EDITOR_BACKGROUND: '1', UI_EDITOR_OPEN_WORKSPACE: project.path };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
async function call(name: string, args: Record<string, unknown> = {}) {
  const reply = await callTool(name, args, discovery);
  return JSON.parse(reply.content[0].text!);
}
const state = () => call('uie.editor.get_state', { detail: 'full' });
async function mutate(name: string, args: Record<string, unknown>) {
  const s = await state(); return call(name, { sessionId: s.sessionId, revision: s.revision, ...args });
}
async function gone(path: string) {
  for (const file of [path, ...Object.values(documentScriptPaths(path))]) await assert.rejects(readFile(file), /ENOENT/);
}
try {
  const page = await app.firstWindow(); page.setDefaultTimeout(10000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'UI 资产 Current', exact: true }).waitFor();
  await mutate('uie.document.open', { target: { documentId: documents.Current.id } });
  await page.getByLabel('节点名称', { exact: true }).fill('Edited');
  await page.getByLabel('节点名称', { exact: true }).press('Tab');
  const before = await state(); assert.equal(before.dirty, true);
  async function response(value: number) { await app.evaluate(({ dialog }, value) => { dialog.showMessageBox = async () => ({ response: value, checkboxChecked: false }); }, value); }
  async function deleteCard(name: string) {
    await page.getByRole('button', { name: `UI 资产 ${name}`, exact: true }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: '删除', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.document-assets')?.getAttribute('aria-busy') === 'false');
  }
  await response(1); await deleteCard('Current');
  assert.deepEqual((await state()).document, before.document); assert.ok(await readFile(paths.Current));
  await response(0); await deleteCard('Other'); await gone(paths.Other);
  assert.deepEqual((await state()).document, before.document); assert.equal((await state()).dirty, true);
  await deleteCard('Current'); await gone(paths.Current);
  await page.getByRole('button', { name: 'UI 资产 Current', exact: true }).waitFor({ state: 'detached' });
  assert.equal((await state()).document, null); assert.equal((await state()).dirty, false);
  await page.keyboard.press('Control+s'); await gone(paths.Current);

  // Deletion also works with an empty canvas; unrelated dirty edits survive.
  await mutate('uie.document.new', { name: 'Work' });
  await page.getByLabel('界面名称', { exact: true }).waitFor();
  await page.waitForFunction(() => (document.querySelector('[aria-label="界面名称"]') as HTMLInputElement)?.value === 'Work');
  await mutate('uie.scripts.set', { source: '-- unsaved work' });
  const dirtyWork = await state();
  await assert.rejects(call('uie.document.delete', { sessionId: before.sessionId, revision: before.revision, target: { library: 'templates', documentId: documents.Template.id } }), /会话/);
  await mutate('uie.document.delete', { target: { library: 'templates', documentId: documents.Template.id } });
  await gone(paths.Template); assert.deepEqual((await state()).document, dirtyWork.document);
  await mutate('uie.document.delete', { target: { library: 'permanent', documentId: documents.Permanent.id } }); await gone(paths.Permanent);
  await mutate('uie.document.save', { relativePath: 'Work.json' });
  const saved = await state();
  await mutate('uie.scripts.set', { source: '-- changed' });
  await assert.rejects(mutate('uie.document.delete', { target: { documentId: saved.documentId } }), /未保存/);
  assert.ok(await readFile(join(project.path, 'interfaces', 'Work', 'Work.json')));
  await mutate('uie.document.delete', { target: { documentId: saved.documentId }, discardChanges: true });
  await page.waitForFunction(() => !document.querySelector('.canvas-viewport'));
  assert.equal((await state()).document, null); await gone(join(project.path, 'interfaces', 'Work', 'Work.json'));
  await assert.rejects(mutate('uie.document.delete', { target: { documentId: saved.documentId } }), /找不到/);
  await assert.rejects(mutate('uie.document.delete', { target: { projectId: crypto.randomUUID(), documentId: saved.documentId } }), /当前工程/);
  await writeDocument(paths.Other, documents.Other);
  await page.getByRole('button', { name: 'UI 资产 Other', exact: true }).waitFor();
  await deleteCard('Other'); await gone(paths.Other);
  assert.deepEqual(errors, []);
  console.log('Document deletion UI/MCP smoke passed: cancel, dirty/current/non-current, scripts, all libraries, stale session and empty canvas.');
} finally { await app.close(); }
