import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { syncAgentWorkspace } from '../electron/agent-workspace';
import { createProject } from '../electron/projects';
import { listDocumentAssets } from '../electron/documents';

async function snapshot(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      for (const [key, value] of Object.entries(await snapshot(path))) result[entry.name + '/' + key] = value;
    } else result[entry.name] = (await readFile(path)).toString('base64');
  }
  return result;
}

test('打开更新公共提示词，保留 styles/LOCAL，重复同步不改写，Git 只忽略公共文件', async t => {
  await mkdir(resolve('test-results'), { recursive: true });
  const root = await mkdtemp(resolve('test-results/agent-sync-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const type = join(root, 'type');
  await cp(resolve('../ProjectTypes/Roblox'), type, { recursive: true });
  const project = (await createProject(root, undefined, resolve('../TemplateStyles/Roblox/多彩棋格风格'), type)).project;
  const agent = join(project.path, 'AgentWorkspace');
  const local = join(agent, 'AGENTS.LOCAL.md');
  await writeFile(local, '# 项目要求');
  await writeFile(join(agent, 'styles', 'Game-DESIGN.md'), '# 自定义风格');
  await writeFile(join(project.path, '.gitignore'), '# custom\n/cache/\n');
  const styles = await snapshot(join(agent, 'styles'));
  await writeFile(join(agent, 'Docs', 'obsolete.md'), 'old');
  await writeFile(join(type, 'Docs', 'runtime-api.md'), '# 新版接口');
  await syncAgentWorkspace(project.path, type);
  assert.equal(await readFile(join(agent, 'Docs', 'runtime-api.md'), 'utf8'), '# 新版接口');
  await assert.rejects(readFile(join(agent, 'Docs', 'obsolete.md')), /ENOENT/);
  assert.equal(await readFile(local, 'utf8'), '# 项目要求');
  assert.deepEqual(await snapshot(join(agent, 'styles')), styles);
  const before = await snapshot(agent);
  const timestamp = (await stat(join(agent, 'Docs', 'runtime-api.md'))).mtimeMs;
  const ignore = await readFile(join(project.path, '.gitignore'), 'utf8');
  assert.ok(ignore.startsWith('# custom\n/cache/\n'));
  await syncAgentWorkspace(project.path, type);
  assert.deepEqual(await snapshot(agent), before);
  assert.equal((await stat(join(agent, 'Docs', 'runtime-api.md'))).mtimeMs, timestamp);
  assert.equal(await readFile(join(project.path, '.gitignore'), 'utf8'), ignore);
  assert.equal((await listDocumentAssets(project.path, 'templates')).length, 7);
  execFileSync('git', ['init', '-q', project.path]);
  for (const path of ['AGENTS.md', 'Docs/runtime-api.md', '.agents/skills/roblox-ui-authoring/SKILL.md']) {
    assert.equal(execFileSync('git', ['check-ignore', 'AgentWorkspace/' + path], { cwd: project.path }).toString().trim(), 'AgentWorkspace/' + path);
  }
  for (const path of ['AGENTS.LOCAL.md', 'styles/Game-DESIGN.md', 'styles/templates/SmallWindow.rbxui.json', 'styles/skills/ui-editor-style-check/SKILL.md']) {
    assert.throws(() => execFileSync('git', ['check-ignore', 'AgentWorkspace/' + path], { cwd: project.path }), error => (error as { status: number }).status === 1);
  }
  await assert.rejects(syncAgentWorkspace(project.path, join(root, 'missing')), /无法读取/);
  assert.deepEqual(await snapshot(agent), before);
  const outside = join(root, 'outside');
  await mkdir(outside);
  await symlink(outside, join(agent, 'Docs', 'linked'), 'junction');
  await assert.rejects(syncAgentWorkspace(project.path, type), /不能是链接/);
  assert.deepEqual(await readdir(outside), []);
});

test('缺失的 AI 入口和 LOCAL 会生成，已有 LOCAL 保留，不创建或读取 styles', async t => {
  await mkdir(resolve('test-results'), { recursive: true });
  const root = await mkdtemp(resolve('test-results/agent-empty-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const type = resolve('../ProjectTypes/Roblox');
  await syncAgentWorkspace(root, type);
  const agent = join(root, 'AgentWorkspace');
  assert.ok((await readFile(join(agent, 'AGENTS.md'), 'utf8')).includes('AGENTS.LOCAL.md'));
  assert.ok((await readFile(join(agent, 'AGENTS.LOCAL.md'), 'utf8')).includes('项目补充要求'));
  await assert.rejects(stat(join(agent, 'styles')), /ENOENT/);
  await writeFile(join(agent, 'AGENTS.LOCAL.md'), '# 保留');
  await syncAgentWorkspace(root, type);
  assert.equal(await readFile(join(agent, 'AGENTS.LOCAL.md'), 'utf8'), '# 保留');
});
