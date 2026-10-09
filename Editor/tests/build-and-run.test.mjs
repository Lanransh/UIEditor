import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

test('BuildAndRun stops after npm ci returns a negative Windows error code', { skip: process.platform !== 'win32' }, async () => {
  const workspace = resolve(import.meta.dirname, '../..');
  const results = join(workspace, 'Editor/test-results');
  await mkdir(results, { recursive: true });
  const fixture = await mkdtemp(join(results, 'build-failure-'));
  try {
    await mkdir(join(fixture, 'Editor'));
    const bin = join(fixture, 'bin');
    await mkdir(bin);
    await copyFile(join(workspace, 'BuildAndRun.bat'), join(fixture, 'BuildAndRun.bat'));
    await writeFile(join(bin, 'npm.cmd'), '@echo off\r\nexit /b -4048\r\n');
    await writeFile(join(bin, 'node.cmd'), '@echo off\r\necho Unexpected node invocation\r\nexit /b 0\r\n');
    const env = { ...process.env, PATH: bin + ';' + process.env.PATH };
    const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'BuildAndRun.bat'], { cwd: fixture, env, input: '\r\n', encoding: 'utf8', windowsHide: true, timeout: 10000 });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Installing dependencies/);
    assert.match(result.stdout, /Build failed/);
    assert.doesNotMatch(result.stdout, /Preparing Electron runtime|Unexpected node invocation/);
  } finally {
    assert.equal(dirname(fixture), results);
    await rm(fixture, { recursive: true, force: true });
  }
});
