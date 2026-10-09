import type { Result } from './project';
import type { UIDocument } from './uiDocument';

export interface ToolkitTarget { id: string; name: string; placeId: string }
export interface ImageUploadTask {
  taskId: string;
  status: 'processing' | 'waiting_review' | 'succeeded' | 'failed';
  message: string;
  pollAfterMs: number;
  robloxId?: string;
}
export type ImageUploadSource = { assetId: string; name: string } | { name: string; dataUrl: string };
export interface ImageUploadTargets { targets: ToolkitTarget[]; automaticTargetId: string }
export interface RobloxImportTask {
  id: string; deliveryId: string; name: string;
  status: 'building' | 'awaiting_studio' | 'succeeded' | 'failed' | 'cancelled';
  message: string; scriptPath: string; sourceClass: string;
}
export interface ToolkitAPI {
  imageTargets(): Promise<Result<ImageUploadTargets>>;
  uploadImage(targetId: string, image: ImageUploadSource): Promise<Result<ImageUploadTask>>;
  imageTask(targetId: string, taskId: string): Promise<Result<ImageUploadTask>>;
  discover(): Promise<Result<ToolkitTarget[]>>;
  submit(targetId: string, document: UIDocument): Promise<Result<RobloxImportTask>>;
  task(targetId: string, taskId: string, action: 'status' | 'retry' | 'cancel'): Promise<Result<RobloxImportTask>>;
}
