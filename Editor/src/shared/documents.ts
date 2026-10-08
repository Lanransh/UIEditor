import type { Result } from './project';
import type { UIDocument, UINode } from './uiDocument';

export interface DocumentFile { document: UIDocument; path: string }
export interface DocumentAsset { name: string; path: string }
export type DocumentLibrary = 'project' | 'templates' | 'permanent';
export function documentLocation(projectPath: string, path: string | null) {
  if (!path) return null;
  const file = path.replaceAll('\\', '/');
  for (const [library, directory] of [['project', 'interfaces'], ['templates', 'AgentWorkspace/styles/templates']] as const) {
    const root = projectPath.replaceAll('\\', '/') + '/' + directory + '/';
    if (file.toLowerCase().startsWith(root.toLowerCase())) return { library, relativePath: file.slice(root.length) };
  }
  return null;
}
export interface DocumentAPI {
  newDocument(): Promise<Result<null>>;
  open(path?: string): Promise<Result<DocumentFile | null>>;
  listAssets(library?: DocumentLibrary): Promise<Result<DocumentAsset[]>>;
  previewAsset(path: string, library?: DocumentLibrary): Promise<Result<DocumentFile>>;
  openTemplate(path: string, library?: 'templates' | 'permanent'): Promise<Result<DocumentFile>>;
  moveAsset(path: string, source: DocumentLibrary, target: DocumentLibrary): Promise<Result<DocumentAsset>>;
  listTemplateFolders(): Promise<Result<string[]>>;
  createTemplateFolder(name: string): Promise<Result<null>>;
  saveTemplate(document: UIDocument, folder?: string): Promise<Result<DocumentFile | null>>;
  save(document: UIDocument, saveAs?: boolean, projectUI?: boolean): Promise<Result<DocumentFile | null>>;
  pickImage(): Promise<Result<UINode['previewImage'] | null>>;
  confirmChanges(): Promise<Result<'save' | 'discard' | 'cancel'>>;
  setDirty(dirty: boolean): void;
  onCloseRequest(callback: () => void): () => void;
  close(): void;
}
