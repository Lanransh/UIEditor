import type { Result } from './project';
import type { UIDocument } from './uiDocument';

export interface ToolkitTarget { id: string; name: string; placeId: string }
export interface RobloxImportTask {
  id: string; deliveryId: string; name: string;
  status: 'building' | 'awaiting_studio' | 'succeeded' | 'failed' | 'cancelled';
  message: string; scriptPath: string; sourceClass: string;
}
export interface ToolkitAPI {
  discover(): Promise<Result<ToolkitTarget[]>>;
  submit(targetId: string, document: UIDocument): Promise<Result<RobloxImportTask>>;
  task(targetId: string, taskId: string, action: 'status' | 'retry' | 'cancel'): Promise<Result<RobloxImportTask>>;
}
