import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ensureWorkspaceLauncher } from '../electron/workspace-launcher';

test('工作区启动文件可更新，Git 只忽略 Run.bat，保留工程与图片', async t => {
  const base = resolve('test-results');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'launcher-中文 '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const executable = join(root, '编辑器 %local% !', 'UIEditor.exe');
  await ensureWorkspaceLauncher(root, executable);
  assert.equal(await readFile(join(root, '.gitignore'), 'utf8'), '/Run.bat\n');
  const script = await readFile(join(root, 'Run.bat'), 'utf8');
  assert.ok(script.includes('set "UI_EDITOR_OPEN_WORKSPACE=%~dp0"'));
  assert.ok(script.includes(executable.replace(/%/g, '%%')));
  assert.ok(script.includes('setlocal DisableDelayedExpansion'));
  await writeFile(join(root, '.gitignore'), '# Existing rules\n/custom.tmp');
  const application = join(root, '开发 编辑器');
  await ensureWorkspaceLauncher(root, executable, application);
  const updated = await readFile(join(root, 'Run.bat'), 'utf8');
  assert.ok(updated.includes(`start "" /wait "%UI_EDITOR_EXE%" "${application}"`));
  await ensureWorkspaceLauncher(root, executable, application);
  assert.equal(await readFile(join(root, '.gitignore'), 'utf8'), '# Existing rules\n/custom.tmp\n/Run.bat\n');
  execFileSync('git', ['init', '-q', root]);
  const ignored = execFileSync('git', ['-C', root, 'check-ignore', '--no-index', '--stdin'], {
    input: 'Run.bat\nproject.json\ninterfaces/reward.rbxui.json\nimage-assets/catalog.json\n.gitignore\n', encoding: 'utf8',
  });
  assert.equal(ignored.trim(), 'Run.bat');
});

test('不覆盖用户启动文件，拒绝目录，检查失败时不改写已有文件', async t => {
  const base = resolve('test-results');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'launcher-protection-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const executable = join(root, 'UIEditor.exe');
  const launcher = join(root, 'Run.bat');
  await writeFile(launcher, 'user script');
  await assert.rejects(ensureWorkspaceLauncher(root, executable), /非自动生成/);
  assert.equal(await readFile(launcher, 'utf8'), 'user script');
  await rm(launcher);
  await ensureWorkspaceLauncher(root, executable);
  const script = await readFile(launcher, 'utf8');
  await rm(join(root, '.gitignore'));
  await mkdir(join(root, '.gitignore'));
  await assert.rejects(ensureWorkspaceLauncher(root, join(root, 'new.exe')), /目录或符号链接/);
  assert.equal(await readFile(launcher, 'utf8'), script);
});
