import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import { join, dirname, basename } from 'node:path';
import { mkdirSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createProject, describeError, openProject, RecentProjects } from './projects';
import type { Project, Result, RecentProjectView } from '../src/shared/project';
import { readDocument, writeDocument, readPreviewImage, safeFileName } from './documents';
import { robloxStrategy } from '../src/editor/roblox';

const runtime = !app.isPackaged && process.env.UI_EDITOR_USER_DATA
  ? process.env.UI_EDITOR_USER_DATA
  : join(app.isPackaged ? dirname(dirname(process.execPath)) : join(__dirname, '..', '..', 'ToolRuntime'), 'Runtime');
for (const name of ['userData', 'sessionData', 'logs', 'crashDumps'] as const) {
  const directory = join(runtime, name);
  mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    const window = new BrowserWindow({
      width: 1200, height: 800, minWidth: 900, minHeight: 600,
      title: 'UI 编辑器', backgroundColor: '#f7f8fa', show: false,
      webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    app.on('second-instance', () => { if (window.isMinimized()) window.restore(); window.focus(); });
    window.once('ready-to-show', () => window.show());
    const source = !app.isPackaged && process.env.UI_EDITOR_DEV_URL
      ? process.env.UI_EDITOR_DEV_URL : pathToFileURL(join(__dirname, '../dist/index.html')).href;
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    const recent = new RecentProjects(runtime);
    let activeProject: Project | null = null;
    let documentPath: string | null = null;
    let dirty = false;
    let allowClose = false;
    const trusted = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === source;
    ipcMain.on('document:dirty', (event, value) => { if (trusted(event) && typeof value === 'boolean') dirty = value; });
    ipcMain.on('document:close', event => { if (trusted(event)) { allowClose = true; window.close(); } });
    window.on('close', event => {
      if (!allowClose && (dirty || busy)) { event.preventDefault(); if (!busy) window.webContents.send('document:close-request'); }
    });
    async function recentViews(): Promise<RecentProjectView[]> {
      return Promise.all((await recent.list()).map(async item => {
        const view: RecentProjectView = { ...item, name: basename(dirname(item.path)) || dirname(item.path) };
        try { await openProject(item.path); } catch (error) { view.problem = describeError(error); }
        return view;
      }));
    }
    let busy = false;
    function handle<T>(channel: string, action: (argument: unknown) => Promise<T>) {
      ipcMain.handle(channel, async (event, argument): Promise<Result<T>> => {
        if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== source) return { ok: false, error: '无效的操作来源。' };
        if (busy) return { ok: false, error: '正在处理工程，请稍后重试。' };
        busy = true;
        try { return { ok: true, value: await action(argument) }; }
        catch (error) { return { ok: false, error: describeError(error) }; }
        finally { busy = false; }
      });
    }
    async function remember(project: Project): Promise<Project> {
      activeProject = project; documentPath = null; dirty = false;
      try { await recent.record(project.path); }
      catch (error) {
        await dialog.showMessageBox(window, { type: 'warning', title: '无法保存最近记录', message: '工程已打开，但无法更新最近工程列表。', detail: describeError(error) });
      }
      return project;
    }
    async function pick(title: string) {
      const result = await dialog.showOpenDialog(window, { title, properties: ['openDirectory'] });
      return result.canceled ? undefined : result.filePaths[0];
    }
    handle('project:create', async () => {
      const parent = await pick('选择父文件夹 — 将自动创建 UIEditorWorkspace');
      if (!parent) return null;
      const result = await createProject(parent);
      if (result.kind === 'existing') {
        const answer = await dialog.showMessageBox(window, { type: 'question', title: '工程已存在', message: '此位置已有有效工程，是否打开？', detail: result.project.path, buttons: ['打开工程', '取消'], defaultId: 0, cancelId: 1 });
        if (answer.response !== 0) return null;
      }
      return remember(result.project);
    });
    handle('project:open', async () => {
      const directory = await pick('打开工程 — 选择 UIEditorWorkspace 文件夹');
      return directory ? remember(await openProject(directory)) : null;
    });
    handle('project:open-recent', async path => remember(await openProject(await recent.resolveRecent(path))));
    handle('project:list-recent', recentViews);
    handle('project:remove-recent', async path => { await recent.remove(await recent.resolveRecent(path)); return recentViews(); });
    const requireProject = () => { if (!activeProject) throw new Error('请先打开工程。'); return activeProject; };
    handle('document:new', async () => { requireProject(); documentPath = null; return null; });
    handle('document:open', async () => {
      const project = requireProject();
      const result = await dialog.showOpenDialog(window, { title: '打开界面', defaultPath: join(project.path, 'interfaces'), properties: ['openFile'], filters: [{ name: 'Roblox UI', extensions: ['rbxui.json'] }] });
      if (result.canceled || !result.filePaths[0]) return null;
      const path = result.filePaths[0], document = await readDocument(path);
      documentPath = path;
      return { path, document };
    });
    handle('document:save', async argument => {
      const project = requireProject();
      if (!argument || typeof argument !== 'object' || !('document' in argument) || !('saveAs' in argument) || typeof argument.saveAs !== 'boolean') throw new Error('保存参数无效。');
      // The destination is only issued by a native dialog, never by renderer input.
      let path = documentPath;
      const document = robloxStrategy.validate(argument.document);
      if (!path || argument.saveAs) {
        const directory = join(project.path, 'interfaces');
        await mkdir(directory, { recursive: true });
        const result = await dialog.showSaveDialog(window, { title: '保存界面', defaultPath: join(directory, `${safeFileName(document.name)}.rbxui.json`), filters: [{ name: 'Roblox UI', extensions: ['rbxui.json'] }] });
        if (result.canceled || !result.filePath) return null;
        path = result.filePath.toLowerCase().endsWith('.rbxui.json') ? result.filePath : `${result.filePath}.rbxui.json`;
        // Appending the extension can change the file checked by the native overwrite dialog.
        if (path !== result.filePath) {
          const exists = await stat(path).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
          if (exists) {
            const answer = await dialog.showMessageBox(window, { type: 'question', title: '文件已存在', message: '是否覆盖已有界面文件？', detail: path, buttons: ['覆盖', '取消'], defaultId: 1, cancelId: 1 });
            if (answer.response !== 0) return null;
          }
        }
      }
      const saved = await writeDocument(path, document);
      documentPath = path;
      return { path, document: saved };
    });
    handle('document:image', async () => {
      requireProject();
      const result = await dialog.showOpenDialog(window, { title: '选择本地预览图片（不会上传）', properties: ['openFile'], filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] });
      return result.canceled || !result.filePaths[0] ? null : readPreviewImage(result.filePaths[0]);
    });
    handle('document:confirm', async () => {
      const result = await dialog.showMessageBox(window, { type: 'question', title: '界面尚未保存', message: '是否保存当前界面的修改？', buttons: ['保存', '不保存', '取消'], defaultId: 0, cancelId: 2 });
      return (['save', 'discard', 'cancel'] as const)[result.response];
    });
    void window.loadURL(source);
  });
  app.on('window-all-closed', () => app.quit());
}
