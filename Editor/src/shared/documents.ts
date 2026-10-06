import type { Result } from './project';
import type { UIDocument, UINode } from './uiDocument';

export interface DocumentFile { document: UIDocument; path: string }
export interface DocumentAsset { name: string; path: string }
export interface DocumentAPI {
  newDocument(): Promise<Result<null>>;
  open(path?: string): Promise<Result<DocumentFile | null>>;
  listAssets(): Promise<Result<DocumentAsset[]>>;
  save(document: UIDocument, saveAs?: boolean): Promise<Result<DocumentFile | null>>;
  pickImage(): Promise<Result<UINode['previewImage'] | null>>;
  confirmChanges(): Promise<Result<'save' | 'discard' | 'cancel'>>;
  setDirty(dirty: boolean): void;
  onCloseRequest(callback: () => void): () => void;
  close(): void;
}
