import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createProject } from '../electron/projects';
import { startBridge } from '../electron/automation-bridge';
import { callTool } from '../mcp/server';
import { definitions, validateTool } from '../src/shared/automation-tools';

test('project.open requires path and accepts only optional boolean minimized, without discard/force flags', () => {
  assert.ok(definitions.find(tool => tool.name === 'uie.project.open'));
  assert.deepEqual(definitions.find(tool => tool.name === 'uie.project.open')!.inputSchema.required, ['path']);
  validateTool('uie.project.open', { path: 'C:\\Game\\UIEditorWorkspace' });
  validateTool('uie.project.open', { path: 'C:\\Game\\UIEditorWorkspace', minimized: false });
  for (const args of [{}, { path: 1 }, { path: 'x', minimized: 'false' }, { path: 'x', discardChanges: true }, { path: 'x', force: true }]) {
    assert.throws(() => validateTool('uie.project.open', args));
  }
});

test('project.open validates directory before contacting bridge and preserves explicit minimization', async () => {
  await mkdir(resolve('test-results'), { recursive: true });
  const root = await mkdtemp(resolve('test-results/project-opening-'));
  const project = (await createProject(root)).project;
  const discovery = join(root, 'bridge.json'), requests: object[] = [];
  const bridge = await startBridge(discovery, async request => {
    requests.push(request);
    return request.name === 'uie.project.open' ? { workspacePath: request.arguments.path, minimized: request.arguments.minimized !== false } : { workspacePath: null };
  });
  try {
    for (const path of ['relative/UIEditorWorkspace', root, join(root, 'missing', 'UIEditorWorkspace')]) {
      await assert.rejects(callTool('uie.project.open', { path }, discovery));
    }
    assert.equal(requests.length, 0);
    const result = await callTool('uie.project.open', { path: project.path, minimized: false }, discovery);
    assert.equal(JSON.parse(result.content[0].text!).minimized, false);
    assert.equal(requests.length, 2);
    await writeFile(join(project.path, 'project.json'), '{}');
    await assert.rejects(callTool('uie.project.open', { path: project.path }, discovery), /版本/);
    assert.equal(requests.length, 2);
  } finally { bridge.close(); }
});

test('unavailable launch setup and unsafe live instance produce errors instead of launching or discarding', async () => {
  await mkdir(resolve('test-results'), { recursive: true });
  const root = await mkdtemp(resolve('test-results/project-opening-errors-'));
  const project = (await createProject(root)).project, discovery = join(root, 'bridge.json');
  await assert.rejects(callTool('uie.project.open', { path: project.path }, discovery), /启动配置/);
  const bridge = await startBridge(discovery, async request => {
    if (request.name === 'uie.project.open') throw new Error('需要人工介入：请保存并关闭当前 UI 编辑器后重试。');
    return { workspacePath: project.path };
  });
  try {
    await assert.rejects(callTool('uie.project.open', { path: project.path }, discovery), /人工介入/);
  } finally { bridge.close(); }
});

test('failed startup reports human intervention without repeatedly launching', async () => {
  await mkdir(resolve('test-results'), { recursive: true });
  const root = await mkdtemp(resolve('test-results/project-startup-failure-'));
  const project = (await createProject(root)).project, discovery = join(root, 'bridge.json');
  const launcher = join(root, 'launcher'); await mkdir(launcher);
  await writeFile(join(launcher, 'index.js'), 'process.exit(1);\n');
  await writeFile(`${discovery}.launch.json`, JSON.stringify({ version: 1, executablePath: process.execPath, applicationPath: launcher }));
  await assert.rejects(callTool('uie.project.open', { path: project.path }, discovery), /启动失败.*人工介入/);
});
