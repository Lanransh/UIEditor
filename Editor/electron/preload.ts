import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ProjectAPI } from '../src/shared/project';
import type { DocumentAPI } from '../src/shared/documents';
import type { RuntimeAPI } from '../src/shared/runtime';
import type { ImageAssetAPI } from '../src/shared/imageAssets';

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
const imageAssets: ImageAssetAPI = {
  list: () => ipcRenderer.invoke('images:list'),
  import: library => ipcRenderer.invoke('images:import', library),
  importFile: (library, file) => ipcRenderer.invoke('images:import-file', { library, path: webUtils.getPathForFile(file) }),
  update: value => ipcRenderer.invoke('images:update', value),
};
contextBridge.exposeInMainWorld('imageAssets', imageAssets);
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
contextBridge.exposeInMainWorld('automation', {
  invoke: (operation: string, argument: unknown) => ipcRenderer.invoke('automation:invoke', { operation, argument }),
  onRequest: (handler: (request: import('../src/shared/automation').AutomationRequest) => Promise<unknown>) => {
    const listener = async (_event: Electron.IpcRendererEvent, request: { requestId: string; name: string; arguments: Record<string, unknown> }) => {
      try { await ipcRenderer.invoke('automation:reply', { requestId: request.requestId, ok: true, value: await handler(request) }); }
      catch (error) { await ipcRenderer.invoke('automation:reply', { requestId: request.requestId, ok: false, error: error instanceof Error ? error.message : String(error) }); }
    };
    ipcRenderer.on('automation:request', listener);
    ipcRenderer.send('automation:ready', true);
    return () => { ipcRenderer.removeListener('automation:request', listener); ipcRenderer.send('automation:ready', false); };
  },
});
