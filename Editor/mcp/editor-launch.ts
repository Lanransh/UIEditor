import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { openProject } from '../electron/projects';

class EditorUnavailable extends Error {}
export const manualIntervention = '需要人工介入：请保存并关闭当前 UI 编辑器后重试。';

export async function requestEditor(name: string, args: Record<string, unknown>, discoveryPath: string): Promise<any> {
  const source = await readFile(discoveryPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') throw new EditorUnavailable('UIEditor 未运行。');
    throw error;
  });
  const discovery = JSON.parse(source);
  if (!Number.isInteger(discovery.port) || discovery.port < 1 || discovery.port > 65535 || typeof discovery.token !== 'string') throw new Error('无效的桥接发现文件。');
  const response = await fetch(`http://127.0.0.1:${discovery.port}/call`, {
    method: 'POST', headers: { authorization: `Bearer ${discovery.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name, arguments: args }),
    signal: AbortSignal.timeout(name === 'uie.document.export' ? 145000 : name === 'uie.project.open' ? 45000 : 15000),
  }).catch(error => {
    if (error.cause?.code === 'ECONNREFUSED') throw new EditorUnavailable('UIEditor 桥接未运行。');
    throw new Error(`无法连接编辑器。${manualIntervention}`, { cause: error });
  });
  if (!response.ok) throw new Error(`编辑器桥接拒绝连接。${manualIntervention}`);
  const result = await response.json() as { ok: boolean; value?: unknown; error?: string };
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

// Only project.open may launch the App. Other tools keep their existing offline behavior.
export async function openEditor(args: Record<string, unknown>, discoveryPath: string) {
  if (typeof args.path !== 'string' || !isAbsolute(args.path)) throw new Error('path 必须是 UIEditorWorkspace 的绝对路径。');
  await openProject(args.path);
  try { await requestEditor('uie.editor.get_state', {}, discoveryPath); }
  catch (error) {
    if (!(error instanceof EditorUnavailable)) throw error;
    const config = JSON.parse(await readFile(`${discoveryPath}.launch.json`, 'utf8').catch(() => {
      throw new Error('缺少编辑器启动配置，请先运行新版编辑器一次并配置 MCP。');
    }));
    if (config.version !== 1 || typeof config.executablePath !== 'string' || !isAbsolute(config.executablePath)
      || (config.applicationPath !== undefined && (typeof config.applicationPath !== 'string' || !isAbsolute(config.applicationPath)))
      || (config.userDataPath !== undefined && (typeof config.userDataPath !== 'string' || !isAbsolute(config.userDataPath)))) throw new Error('无效的编辑器启动配置，请在编辑器中重新配置 MCP。');
    const env: NodeJS.ProcessEnv = { ...process.env, UI_EDITOR_MCP_LAUNCH: '1', UI_EDITOR_MINIMIZED: args.minimized === false ? '0' : '1' };
    for (const key of ['ELECTRON_RUN_AS_NODE', 'UI_EDITOR_OPEN_WORKSPACE', 'UI_EDITOR_DEV_URL', 'UI_EDITOR_USER_DATA']) delete env[key];
    if (config.userDataPath) Object.assign(env, { UI_EDITOR_USER_DATA: config.userDataPath });
    const child = spawn(config.executablePath, config.applicationPath ? [config.applicationPath] : [], {
      env, cwd: config.applicationPath, detached: true, windowsHide: true, stdio: 'ignore',
    });
    let exitCode: number | null | undefined;
    child.once('exit', code => { exitCode = code; });
    await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); }).catch(error => {
      throw new Error(`无法启动编辑器：${String(error)}`);
    });
    child.unref();
    const deadline = Date.now() + 20000;
    while (true) {
      try { await requestEditor('uie.editor.get_state', {}, discoveryPath); break; }
      catch (error) {
        if (!(error instanceof EditorUnavailable)) throw error;
        if ((exitCode !== undefined && exitCode !== 0) || Date.now() >= deadline) throw new Error(`编辑器启动失败或桥接就绪超时；可能已有无法连接的实例。${manualIntervention}`);
        await delay(100);
      }
    }
  }
  return requestEditor('uie.project.open', args, discoveryPath);
}
