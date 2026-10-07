import { createRobloxImportPackage } from '../src/shared/robloxImport';
import type { ToolkitTarget, RobloxImportTask } from '../src/shared/toolkit';

const bridge = 'http://127.0.0.1:34871';
interface TargetConnection extends ToolkitTarget { token: string }
export class ToolkitClient {
  private targets = new Map<string, TargetConnection>();
  constructor(private request: typeof fetch = fetch) {}
  private async exchange(path: string, target?: TargetConnection, payload?: unknown): Promise<unknown> {
    const response = await this.request(bridge + path, {
      method: payload === undefined ? 'GET' : 'POST', redirect: 'error',
      signal: AbortSignal.timeout(path === '/ui-editor/submit' ? 125000 : 10000),
      headers: { ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(target ? { Authorization: `Bearer ${target.token}`, 'X-SGT-Place-Id': target.placeId } : {}) },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    }).catch(() => { throw new Error('无法连接 StudioGameToolkit，请打开目标游戏工程并确认后台与 Rojo 已启动。'); });
    const content = await response.text();
    if (content.length > 256 * 1024) throw new Error('Toolkit 响应过大。');
    const value = JSON.parse(content);
    if (!response.ok) throw new Error(typeof value.error === 'string' ? value.error : `Toolkit HTTP ${response.status}`);
    return value;
  }
  async discover(): Promise<ToolkitTarget[]> {
    const value = await this.exchange('/discover') as { uiEditorImport?: unknown; projects?: unknown };
    if (value.uiEditorImport !== 1 || !Array.isArray(value.projects)) throw new Error('请更新并重启 StudioGameToolkit，当前服务不支持 UIEditor 导入。');
    const targets = value.projects as TargetConnection[];
    if (targets.some(target => !target || typeof target.id !== 'string' || typeof target.name !== 'string' || typeof target.token !== 'string' || typeof target.placeId !== 'string')) throw new Error('Toolkit 工程信息无效。');
    this.targets = new Map(targets.filter(target => /^[1-9][0-9]*$/.test(target.placeId)).map(target => [target.id, target]));
    return [...this.targets.values()].map(({ id, name, placeId }) => ({ id, name, placeId }));
  }
  private target(id: string) {
    const target = this.targets.get(id);
    if (!target) throw new Error('目标工程连接已失效，请刷新工程列表。');
    return target;
  }
  private validateTask(value: unknown): RobloxImportTask {
    const task = value as RobloxImportTask;
    if (!task || typeof task.id !== 'string' || !/^[a-f0-9]{32}$/.test(task.id) ||
      !['building', 'awaiting_studio', 'succeeded', 'failed', 'cancelled'].includes(task.status) ||
      ['message', 'name', 'scriptPath', 'sourceClass', 'deliveryId'].some(key => typeof task[key as keyof RobloxImportTask] !== 'string')) throw new Error('Toolkit 导入任务响应无效。');
    return task;
  }
  async submit(id: string, source: unknown): Promise<RobloxImportTask> {
    const payload = createRobloxImportPackage(source);
    if (Buffer.byteLength(JSON.stringify(payload)) > 8 * 1024 * 1024) throw new Error('导入包超过 8 MiB。');
    return this.validateTask(await this.exchange('/ui-editor/submit', this.target(id), payload));
  }
  async task(id: string, taskId: string, action: string): Promise<RobloxImportTask> {
    if (!/^[a-f0-9]{32}$/.test(taskId) || !['status', 'retry', 'cancel'].includes(action)) throw new Error('任务操作无效。');
    return this.validateTask(await this.exchange('/ui-editor/task', this.target(id), { taskId, action }));
  }
}
