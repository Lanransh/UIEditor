import { contextBridge, ipcRenderer } from 'electron';
import type { ProjectAPI } from '../src/shared/project';
import type { DocumentAPI } from '../src/shared/documents';
import type { RuntimeAPI } from '../src/shared/runtime';

const api: ProjectAPI = {
  create: () => ipcRenderer.invoke('project:create'),
  open: () => ipcRenderer.invoke('project:open'),
  openRecent: (path) => ipcRenderer.invoke('project:open-recent', path),
  listRecent: () => ipcRenderer.invoke('project:list-recent'),
  removeRecent: (path) => ipcRenderer.invoke('project:remove-recent', path),
};
contextBridge.exposeInMainWorld('projects', api);
const documents: DocumentAPI = {
  newDocument: () => ipcRenderer.invoke('document:new'),
  open: path => ipcRenderer.invoke('document:open', path),
  listAssets: () => ipcRenderer.invoke('document:list-assets'),
  save: (document, saveAs = false) => ipcRenderer.invoke('document:save', { document, saveAs }),
  pickImage: () => ipcRenderer.invoke('document:image'),
  confirmChanges: () => ipcRenderer.invoke('document:confirm'),
  setDirty: dirty => ipcRenderer.send('document:dirty', dirty),
  onCloseRequest: callback => { const listener = () => callback(); ipcRenderer.on('document:close-request', listener); return () => ipcRenderer.removeListener('document:close-request', listener); },
  close: () => ipcRenderer.send('document:close'),
};
contextBridge.exposeInMainWorld('documents', documents);
const runtime: RuntimeAPI = {
  start: document => ipcRenderer.invoke('runtime:start', document),
  command: (session, command) => ipcRenderer.invoke('runtime:command', { session, command }),
  stop: session => ipcRenderer.invoke('runtime:stop', session),
  onEnded: callback => {
    const listener = (_event: Electron.IpcRendererEvent, event: { session: string; error: string }) => callback(event);
    ipcRenderer.on('runtime:ended', listener);
    return () => ipcRenderer.removeListener('runtime:ended', listener);
  },
};
contextBridge.exposeInMainWorld('runtime', runtime);
