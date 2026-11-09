import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { syncAgentWorkspace, WORKSPACE_INSTRUCTIONS } from '../electron/agent-workspace';
import { createProject } from '../electron/projects';
import { listDocumentAssets } from '../electron/documents';

async function snapshot(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      for (const [key, value] of Object.entries(await snapshot(path))) result[entry.name + '/' + key] = value;
    } else result[entry.name] = (await readFile(path)).toString('base64');
  }
  return result;
}

test('新工程只生成 MCP 路由，不复制公共 Docs/skills；重开不覆盖或删除旧副本和项目文件', async t => {
  await mkdir(resolve('test-results'), { recursive: true });
  const root = await mkdtemp(resolve('test-results/agent-route-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = (await createProject(root, undefined, resolve('../TemplateStyles/Roblox/多彩棋格风格'))).project;
  const agent = project.path;
  assert.equal(await readFile(join(agent, 'AGENTS.md'), 'utf8'), WORKSPACE_INSTRUCTIONS);
  for (const name of ['Docs', '.agents']) await assert.rejects(stat(join(agent, name)), /ENOENT/);
  await mkdir(join(agent, 'Docs'));
  await mkdir(join(agent, '.agents', 'skills', 'custom'), { recursive: true });
  await writeFile(join(agent, 'Docs', 'runtime-api.md'), '# 旧副本或项目资料');
  await writeFile(join(agent, '.agents', 'skills', 'custom', 'SKILL.md'), '# 项目技能');
  await writeFile(join(agent, 'AGENTS.md'), '<!-- UIEditor managed workspace: 旧入口 -->\n旧规范');
  await writeFile(join(agent, 'AGENTS.LOCAL.md'), '# 项目要求');
  await writeFile(join(agent, 'styles', 'Game-DESIGN.md'), '# 自定义风格');
  await writeFile(join(agent, '.gitignore'), '# custom\n/cache/\n');
  const styles = await snapshot(join(agent, 'styles'));
  await syncAgentWorkspace(agent);
  assert.equal(await readFile(join(agent, 'AGENTS.md'), 'utf8'), WORKSPACE_INSTRUCTIONS);
  assert.equal(await readFile(join(agent, 'Docs', 'runtime-api.md'), 'utf8'), '# 旧副本或项目资料');
  assert.equal(await readFile(join(agent, '.agents', 'skills', 'custom', 'SKILL.md'), 'utf8'), '# 项目技能');
  assert.equal(await readFile(join(agent, 'AGENTS.LOCAL.md'), 'utf8'), '# 项目要求');
  assert.deepEqual(await snapshot(join(agent, 'styles')), styles);
  const before = await snapshot(agent), timestamp = (await stat(join(agent, 'AGENTS.md'))).mtimeMs;
  await syncAgentWorkspace(agent);
  assert.deepEqual(await snapshot(agent), before);
  assert.equal((await stat(join(agent, 'AGENTS.md'))).mtimeMs, timestamp);
  assert.equal((await listDocumentAssets(agent, 'templates')).length, 7);
  execFileSync('git', ['init', '-q', agent]);
  assert.equal(execFileSync('git', ['check-ignore', 'AGENTS.md'], { cwd: agent }).toString().trim(), 'AGENTS.md');
  for (const path of ['AGENTS.LOCAL.md', 'Docs/runtime-api.md', '.agents/skills/custom/SKILL.md', 'styles/Game-DESIGN.md']) {
    assert.throws(() => execFileSync('git', ['check-ignore', path], { cwd: agent }), error => (error as { status: number }).status === 1);
  }
});

test('缺失入口和 LOCAL 会生成，自定义入口、旧忽略规则和 LOCAL 保留；不遍历 Docs/skills 链接', async t => {
  await mkdir(resolve('test-results'), { recursive: true });
  const root = await mkdtemp(resolve('test-results/agent-empty-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await syncAgentWorkspace(root);
  assert.match(await readFile(join(root, 'AGENTS.md'), 'utf8'), /uie\.docs\.read/);
  await writeFile(join(root, 'AGENTS.md'), '# 自定义入口');
  await writeFile(join(root, 'AGENTS.LOCAL.md'), '# 保留');
  await writeFile(join(root, '.gitignore'), '/Docs/\n/.agents/skills/\n');
  const outside = join(root, 'outside'); await mkdir(outside);
  await symlink(outside, join(root, 'Docs'), 'junction');
  await syncAgentWorkspace(root);
  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), '# 自定义入口');
  assert.equal(await readFile(join(root, 'AGENTS.LOCAL.md'), 'utf8'), '# 保留');
  assert.ok((await readFile(join(root, '.gitignore'), 'utf8')).startsWith('/Docs/\n/.agents/skills/\n'));
  assert.deepEqual(await readdir(outside), []);
  await rm(join(root, 'AGENTS.md'));
  await mkdir(join(root, 'AGENTS.md'));
  await assert.rejects(syncAgentWorkspace(root), /普通文件/);
});
