import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createCursorMcpSettingsStore } from '../electron/cursor-mcp-settings.cjs';

test('Cursor settings preserve other services, repair paths, toggle and reject invalid input', async () => {
  await mkdir('test-results', { recursive: true });
  const root = await mkdtemp(resolve('test-results/cursor-settings-'));
  try {
    const filePath = join(root, '.cursor', 'mcp.json'), serverPath = join(root, '中文 server.mjs'), discoveryPath = join(root, 'bridge.json');
    await writeFile(serverPath, '');
    const store = createCursorMcpSettingsStore({ filePath, serverPath, discoveryPath });
    assert.equal((await store.getStatus()).configured, false);
    assert.equal((await store.setEnabled(false)).enabled, false);
    assert.equal((await store.setEnabled(true)).enabled, true);
    const config = JSON.parse(await readFile(filePath, 'utf8'));
    assert.deepEqual(config.mcpServers['ui-editor'].args, [serverPath.replace(/\\/g, '/'), '--stdio', '--discovery', discoveryPath]);
    config.extra = { keep: true };
    config.mcpServers.other = { command: 'other', env: { KEEP: 'yes' } };
    config.mcpServers['ui-editor'] = { command: 'old', args: [], env: { CUSTOM: 'yes' } };
    await writeFile(filePath, JSON.stringify(config));
    await store.setEnabled(true);
    const repaired = JSON.parse(await readFile(filePath, 'utf8'));
    assert.equal(repaired.mcpServers['ui-editor'].command, 'node');
    assert.deepEqual(repaired.mcpServers['ui-editor'].env, { CUSTOM: 'yes' });
    assert.equal(repaired.mcpServers['ui-editor'].args[0], serverPath.replace(/\\/g, '/'));
    assert.equal((await store.setEnabled(false)).enabled, false);
    assert.deepEqual(JSON.parse(await readFile(filePath, 'utf8')), { extra: config.extra, mcpServers: { other: config.mcpServers.other } });
    for (const invalid of ['', '{', 'null', '[]', '{"mcpServers":[]}', '{"mcpServers":{"ui-editor":null}}']) {
      await writeFile(filePath, invalid);
      await assert.rejects(store.getStatus(), /JSON/);
      await assert.rejects(store.setEnabled(true), /JSON/);
      await assert.rejects(store.setEnabled(false), /JSON/);
      assert.equal(await readFile(filePath, 'utf8'), invalid);
    }
    await assert.rejects(store.setEnabled('true'), /开关状态无效/);
    await writeFile(filePath, '{}'); await rm(serverPath);
    await assert.rejects(store.setEnabled(true), /不可用/);
    assert.equal(await readFile(filePath, 'utf8'), '{}');
  } finally { await rm(root, { recursive: true, force: true }); }
});
