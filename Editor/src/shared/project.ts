export const WORKSPACE_DIRECTORY = 'UIEditorWorkspace';

export interface ProjectManifest {
  version: 1;
  id: string;
  mode: 'roblox';
  createdAt: string;
}

export interface Project {
  path: string;
  name: string;
  manifest: ProjectManifest;
}

export interface RecentProject {
  path: string;
  lastOpenedAt: string;
}

export interface RecentProjectView extends RecentProject {
  name: string;
  problem?: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export interface ProjectAPI {
  openStartup(): Promise<Result<Project | null>>;
  onActivated(callback: (project: Project) => void): () => void;
  create(templateSource?: string): Promise<Result<Project | null>>;
  open(): Promise<Result<Project | null>>;
  openRecent(path: string): Promise<Result<Project>>;
  listRecent(): Promise<Result<RecentProjectView[]>>;
  removeRecent(path: string): Promise<Result<RecentProjectView[]>>;
}
