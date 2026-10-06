import { contextBridge, ipcRenderer } from 'electron';
import type { ProjectAPI } from '../src/shared/project';

const api: ProjectAPI = {
  create: () => ipcRenderer.invoke('project:create'),
  open: () => ipcRenderer.invoke('project:open'),
  openRecent: (path) => ipcRenderer.invoke('project:open-recent', path),
  listRecent: () => ipcRenderer.invoke('project:list-recent'),
  removeRecent: (path) => ipcRenderer.invoke('project:remove-recent', path),
};
contextBridge.exposeInMainWorld('projects', api);
