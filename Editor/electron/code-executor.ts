import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { robloxStrategy } from '../src/editor/roblox';
import { type UIDocument, type UINode } from '../src/shared/uiDocument';
import type { ProjectStrategy } from '../src/editor/strategy';
import { resolveImageAssets, type ImageAsset } from '../src/shared/imageAssets';

export interface CodeAdapter {
  language: string;
  version: string;
  strategy: ProjectStrategy;
  execute(directory: string, document: UIDocument, source: string, assets?: ImageAsset[]): Promise<{ document: UIDocument; logs: unknown[]; operationCount: number }>;
}
export const robloxCodeAdapter: CodeAdapter = {
  language: robloxStrategy.automation.authoring.language, version: robloxStrategy.automation.authoring.version, strategy: robloxStrategy,
  async execute(directory, document, source, assets = []) {
    if (typeof source !== 'string' || Buffer.byteLength(source) > 256 * 1024) throw new Error('制作代码最多 256 KiB。');
    const [bootstrap, editor] = await Promise.all(['bootstrap.luau', 'editor.luau'].map(name => readFile(join(directory, name), 'utf8')));
    const input = { type: 'edit', projectType: this.strategy.mode, capabilities: this.strategy.automation, bootstrap: bootstrap.slice(0, bootstrap.indexOf('local Base = {}')) + editor, document: resolveImageAssets(document, assets), assets: assets.map(({ previewImage: _, ...asset }) => asset), definitions: this.strategy.nodes, ids: Array.from({ length: 5000 }, () => randomUUID()), source };
    const line = JSON.stringify(input);
    if (Buffer.byteLength(line) > 8 * 1024 * 1024) throw new Error('执行消息超过 8 MiB。');
    const result = await new Promise<any>((resolve, reject) => {
      const child = spawn(join(directory, 'ui-luau.exe'), [], { windowsHide: true, stdio: 'pipe' }); let output = ''; let settled = false;
      const finish = (error?: Error, value?: unknown) => { if (settled) return; settled = true; clearTimeout(timer); child.kill(); if (error) reject(error); else resolve(value); };
      const timer = setTimeout(() => finish(new Error('代码执行超时。')), 2000);
      child.on('error', error => finish(error)); child.stderr.resume();
      child.stdin.on('error', error => finish(error));
      child.stdout.on('data', chunk => {
        output += chunk.toString();
        if (Buffer.byteLength(output) > 8 * 1024 * 1024) return finish(new Error('执行结果超过 8 MiB。'));
        if (output.includes('\n')) {
          try { finish(undefined, JSON.parse(output.slice(0, output.indexOf('\n')))); } catch (error) { finish(error as Error); }
        }
      });
      child.on('exit', () => { if (!settled) finish(new Error('代码执行进程退出，未返回结果。')); });
      child.stdin.end(line + '\n');
    });
    if (!result.ok) throw Object.assign(new Error(result.error), { logs: result.logs ?? [], stage: 'execution' });
    const normalize = (node: UINode) => { if (!Array.isArray(node.children) && node.children && Object.keys(node.children).length === 0) node.children = []; if (Array.isArray(node.children)) node.children.forEach(normalize); };
    normalize(result.value.document.root);
    try { return { document: this.strategy.validate(resolveImageAssets(result.value.document, assets)), logs: result.value.logs, operationCount: result.value.operationCount }; }
    catch (error) { throw Object.assign(error as Error, { logs: result.value.logs, stage: 'validation' }); }
  },
};
export async function executeCode(adapter: CodeAdapter, directory: string, document: UIDocument, language: unknown, source: unknown, assets: ImageAsset[] = []) {
  if (language !== adapter.language) throw new Error(`当前工程只支持 ${adapter.language} ${adapter.version}。`);
  if (typeof source !== 'string') throw new Error('source 必须是字符串。');
  return adapter.execute(directory, document, source, assets);
}
export function getCodeAdapter(projectType: string): CodeAdapter {
  if (projectType === 'roblox') return robloxCodeAdapter;
  throw new Error(`未注册 ${projectType} 的代码执行器。`);
}
