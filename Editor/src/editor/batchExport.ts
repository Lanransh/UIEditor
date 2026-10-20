import type { RobloxImportTask } from '../shared/toolkit';
import type { UIDocument } from '../shared/uiDocument';
import { resolveImageAssets, type ImageAsset } from '../shared/imageAssets';

export type BatchExportStatus = 'queued' | 'loading' | 'submitting' | 'waiting' | 'succeeded' | 'failed' | 'stopped' | 'uncertain' | 'skipped';
export interface BatchExportItem {
  path: string;
  name: string;
  status: BatchExportStatus;
  message: string;
  document?: UIDocument;
  task?: RobloxImportTask;
}
interface BatchExportHooks {
  load(path: string): Promise<UIDocument>;
  validationError(document: UIDocument): string;
  submit(document: UIDocument): Promise<RobloxImportTask>;
  status(task: RobloxImportTask): Promise<RobloxImportTask>;
  wait?(milliseconds: number): Promise<void>;
  onUpdate(item: BatchExportItem): void;
  signal?: AbortSignal;
}

export function createBatchExportSnapshot(document: UIDocument, assets: ImageAsset[]): UIDocument {
  const snapshot = structuredClone(resolveImageAssets(document, assets));
  // Freeze resolved image IDs so retrying an uncertain submission sends the same package.
  function freezeImages(node: UIDocument['root']) {
    if (node.properties.Image) delete node.imageAssetId;
    node.children.forEach(freezeImages);
  }
  freezeImages(snapshot.root);
  return snapshot;
}

const terminal = new Set<RobloxImportTask['status']>(['succeeded', 'failed', 'cancelled']);
function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, milliseconds);
    signal?.addEventListener('abort', finish, { once: true });
  });
}

export async function runSequentialExport(assets: Pick<BatchExportItem, 'path' | 'name' | 'document' | 'task'>[], hooks: BatchExportHooks): Promise<BatchExportItem[]> {
  const results: BatchExportItem[] = [];
  function skipRemaining(index: number) {
    for (const asset of assets.slice(index)) {
      const status = asset.task && !terminal.has(asset.task.status) ? 'stopped' : asset.document ? 'uncertain' : 'skipped';
      const item: BatchExportItem = { ...asset, status, message: status === 'skipped' ? '队列已停止，尚未导出。'
        : '队列已停止，当前提交仍未确认结束。' };
      results.push(item); hooks.onUpdate(item);
    }
  }
  for (let index = 0; index < assets.length; index++) {
    if (hooks.signal?.aborted) { skipRemaining(index); break; }
    const asset = assets[index];
    let item: BatchExportItem = { ...asset, status: 'loading', message: '正在读取界面…' };
    const update = (patch: Partial<Omit<BatchExportItem, 'path' | 'name'>>) => {
      item = { ...item, ...patch };
      hooks.onUpdate(item);
    };
    hooks.onUpdate(item);
    try {
      let task = asset.task;
      if (!task) {
        const document = asset.document ?? await hooks.load(asset.path);
        if (hooks.signal?.aborted) { skipRemaining(index); break; }
        const validationError = hooks.validationError(document);
        if (validationError) throw new Error(validationError);
        update({ status: 'submitting', message: '正在提交到 Toolkit…', document });
        task = await hooks.submit(document);
        update({ task, document: undefined });
      }
      update({ status: 'waiting', message: task.message || '等待 Studio 回执…' });
      while (!terminal.has(task.status)) {
        await (hooks.wait ? hooks.wait(1800) : delay(1800, hooks.signal));
        if (hooks.signal?.aborted) break;
        try {
          task = await hooks.status(task);
          update({ task, message: task.message || '等待 Studio 回执…' });
        }
        catch (cause) {
          update({ status: 'waiting', message: `查询回执失败，将继续查询：${cause instanceof Error ? cause.message : String(cause)}` });
        }
        if (hooks.signal?.aborted) break;
      }
      if (task.status === 'succeeded') update({ status: 'succeeded', message: task.message || '已导出到 Studio' });
      else if (terminal.has(task.status)) update({ status: 'failed', message: task.status === 'cancelled' ? '导出已取消' : task.message || '导出失败' });
      else update({ status: 'stopped', message: '队列已停止，当前任务仍可能在 Studio 执行。' });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      update(item.status === 'submitting' || (asset.document && !asset.task)
        ? { status: 'uncertain', message: `提交结果未知，队列已暂停：${message}` }
        : { status: hooks.signal?.aborted ? 'skipped' : 'failed', message, document: undefined });
    }
    results.push(item);
    if (hooks.signal?.aborted || item.status === 'uncertain' || item.status === 'stopped') { skipRemaining(index + 1); break; }
  }
  return results;
}
