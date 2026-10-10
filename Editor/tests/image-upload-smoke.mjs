import { _electron as electron } from 'playwright';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

await mkdir('test-results', { recursive: true });
const env = { ...process.env, UI_EDITOR_BACKGROUND: '1', UI_EDITOR_USER_DATA: await mkdtemp(resolve('test-results/toolkit-startup-')) }; delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ args: ['-r', resolve('tests/fixtures/toolkit-startup.cjs'), '.'], env });
  const page = await app.firstWindow();
  await page.getByRole('button', { name: '创建工程', exact: true }).waitFor();
  assert.equal(await page.getByRole('dialog', { name: '上传图片到 Roblox', exact: true }).count(), 0);
  const initial = await app.evaluate(() => globalThis.toolkitStartupQA.attempts.slice());
  assert.ok(initial.length >= 1, 'Editor startup must attempt a connection while still in the Hub');
  await app.evaluate(() => { globalThis.toolkitStartupQA.online = true; });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && !(await app.evaluate(() => globalThis.toolkitStartupQA.connected))) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const state = await app.evaluate(() => ({ ...globalThis.toolkitStartupQA }));
  assert.equal(state.connected, true);
  assert.ok(state.attempts.length >= 2);
  const interval = state.attempts.at(-1) - state.attempts.at(-2);
  assert.ok(interval >= 4900 && interval < 7500, `Expected a five-second retry, got ${interval} ms`);
  assert.equal(state.otherRequests, 0, 'Connecting must not upload images or import UI');
  await new Promise(resolve => setTimeout(resolve, 5500));
  assert.equal(await app.evaluate(() => globalThis.toolkitStartupQA.attempts.length), state.attempts.length);
  console.log('Editor startup connects from the Hub without an upload dialog, retries after five seconds, stops on recovery and does not upload');
} finally {
  if (app) { await app.evaluate(({ app }) => app.exit()).catch(() => {}); await app.close(); }
}
