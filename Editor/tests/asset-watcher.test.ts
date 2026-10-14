import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { watchAssetDirectory } from '../electron/asset-watcher';

test('asset watcher follows nested edits, missing/recreated roots, and stops cleanly', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'uie-watch-'));
  const root = join(parent, 'ArtSource', 'UI');
  let revision = 0;
  const errors: Error[] = [];
  const stop = watchAssetDirectory(root, () => revision++, error => errors.push(error));
  async function change(action: () => Promise<unknown>) {
    const before = revision;
    await action();
    for (let i = 0; i < 100 && revision === before; i++) await delay(25);
    assert.ok(revision > before, 'filesystem change should emit a notification');
  }
  try {
    await change(() => mkdir(join(root, 'nested'), { recursive: true }));
    const file = join(root, 'nested', 'image.png');
    await change(() => writeFile(file, 'first'));
    await change(() => writeFile(file, 'replacement'));
    await change(() => writeFile(`${file}.meta`, '{}'));
    await change(() => rename(file, join(root, 'nested', 'renamed.png')));
    await change(() => rm(root, { recursive: true }));
    await change(() => mkdir(root));
    await change(() => writeFile(join(root, 'new.png'), 'new'));
    const before = revision;
    await writeFile(join(parent, 'unrelated.txt'), 'ignore');
    await delay(300);
    assert.equal(revision, before);
    await writeFile(join(root, 'pending.png'), 'pending');
    stop();
    await delay(300);
    assert.equal(revision, before, 'stop cancels pending notifications');
    assert.deepEqual(errors, []);
  } finally { stop(); await rm(parent, { recursive: true, force: true }); }
});
