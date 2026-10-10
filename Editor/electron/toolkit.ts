import { createRobloxImportPackage } from '../src/shared/robloxImport';
import type { ToolkitTarget, RobloxImportTask, ImageUploadTask, ImageUploadTargets } from '../src/shared/toolkit';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { realpath } from 'node:fs/promises';

const bridge = 'http://127.0.0.1:34871';
export function toolkitProjectId(path: string): string {
  const normalized = process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
  return createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 16);
}
interface TargetConnection extends ToolkitTarget { token: string }
export class ToolkitClient {
  private targets = new Map<string, TargetConnection>();
  private imageUploadSupported = false;
  private connecting = false;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private discovery?: Promise<ToolkitTarget[]>;
  constructor(private request: typeof fetch = fetch) {}
  startConnection() {
    if (this.connecting) return;
    this.connecting = true;
    void this.discover().catch(() => {});
  }
  stopConnection() {
    this.connecting = false;
    clearTimeout(this.retryTimer); this.retryTimer = undefined;
  }
  private retryConnection() {
    if (!this.connecting || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.discover().catch(() => {});
    }, 5000);
  }
  private async exchange(path: string, target?: TargetConnection, payload?: unknown): Promise<unknown> {
    const response = await this.request(bridge + path, {
      method: payload === undefined ? 'GET' : 'POST', redirect: 'error',
      signal: AbortSignal.timeout(path === '/ui-editor/submit' ? 125000 : 10000),
      headers: { ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(target ? { Authorization: `Bearer ${target.token}`, 'X-SGT-Place-Id': target.placeId } : {}) },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    }).catch(() => { this.retryConnection(); throw new Error('无法连接 StudioGameToolkit，请打开目标游戏工程并确认后台与 Rojo 已启动。'); });
    const content = await response.text();
    if (content.length > 256 * 1024) throw new Error('Toolkit 响应过大。');
    const value = JSON.parse(content);
    if (!response.ok) {
      if (response.status === 401 || response.status === 403 || response.status >= 500 || /连接已失效/.test(value.error)) this.retryConnection();
      throw new Error(typeof value.error === 'string' ? value.error : `Toolkit HTTP ${response.status}`);
    }
    return value;
  }
  discover(): Promise<ToolkitTarget[]> {
    if (!this.discovery) this.discovery = this.discoverTargets().then(targets => {
      clearTimeout(this.retryTimer); this.retryTimer = undefined;
      if (!targets.length) this.retryConnection();
      return targets;
    }).catch(error => { this.retryConnection(); throw error; }).finally(() => { this.discovery = undefined; });
    return this.discovery;
  }
  private async discoverTargets(): Promise<ToolkitTarget[]> {
    const value = await this.exchange('/discover') as { uiEditorImport?: unknown; uiEditorImageUpload?: unknown; projects?: unknown };
    this.imageUploadSupported = value.uiEditorImageUpload === 1;
    if (value.uiEditorImport !== 1 || !Array.isArray(value.projects)) throw new Error('请更新并重启 StudioGameToolkit，当前服务不支持 UIEditor 导入。');
    const targets = value.projects as TargetConnection[];
    if (targets.some(target => !target || typeof target.id !== 'string' || typeof target.name !== 'string' || typeof target.token !== 'string' || typeof target.placeId !== 'string')) throw new Error('Toolkit 工程信息无效。');
    this.targets = new Map(targets.filter(target => /^[1-9][0-9]*$/.test(target.placeId)).map(target => [target.id, target]));
    return [...this.targets.values()].map(({ id, name, placeId }) => ({ id, name, placeId }));
  }
  private target(id: string) {
    const target = this.targets.get(id);
    if (!target) { this.retryConnection(); throw new Error('目标工程连接已失效，请刷新工程列表。'); }
    return target;
  }
  async imageTargets(workspace: string): Promise<ImageUploadTargets> {
    const targets = await this.discover();
    this.requireImageUpload();
    const sibling = await realpath(join(dirname(workspace), 'GameKitWorkspace')).catch(() => null);
    const automaticTargetId = sibling ? targets.find(target => target.id === toolkitProjectId(sibling))?.id ?? '' : '';
    return { targets, automaticTargetId };
  }
  private requireImageUpload() {
    if (!this.imageUploadSupported) throw new Error('请更新并重启 StudioGameToolkit，当前服务不支持图片上传。');
  }
  private imageResult(value: unknown): ImageUploadTask {
    const task = value as ImageUploadTask;
    if (!task || typeof task.taskId !== 'string' || !/^[a-f0-9]{32}$/.test(task.taskId) ||
      !['processing', 'waiting_review', 'succeeded', 'failed'].includes(task.status) ||
      typeof task.message !== 'string' || !Number.isSafeInteger(task.pollAfterMs) || task.pollAfterMs < 3000 ||
      (task.status === 'succeeded' && (!/^rbxassetid:\/\/[1-9][0-9]*$/.test(task.robloxId ?? '') ||
        (value as Record<string, unknown>).assetType !== 'Image' || (value as Record<string, unknown>).gameAccess !== 'not_verified'))) {
      throw new Error('Toolkit 图片上传任务响应无效。');
    }
    if (task.status === 'failed' && /连接已失效/.test(task.message)) this.retryConnection();
    return { taskId: task.taskId, status: task.status, message: task.message, pollAfterMs: task.pollAfterMs,
      ...(task.status === 'succeeded' ? { robloxId: task.robloxId } : {}) };
  }
  async uploadImage(id: string, name: string, dataUrl: string): Promise<ImageUploadTask> {
    this.requireImageUpload();
    const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!match) throw new Error('图片格式无效。');
    if (Buffer.from(match[2], 'base64').length > 8 * 1024 * 1024) throw new Error('图片不能超过 8 MiB。');
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 120 || /[\x00-\x1f]/.test(name)) throw new Error('图片名称无效。');
    return this.imageResult(await this.exchange('/ui-editor/image-upload', this.target(id), { name, dataUrl }));
  }
  async imageTask(id: string, taskId: string): Promise<ImageUploadTask> {
    this.requireImageUpload();
    if (!/^[a-f0-9]{32}$/.test(taskId)) throw new Error('图片任务 ID 无效。');
    return this.imageResult(await this.exchange('/ui-editor/image-upload-task', this.target(id), { taskId }));
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
