import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import { join, dirname, basename } from 'node:path';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createProject, describeError, openProject, RecentProjects } from './projects';
import type { Project, Result, RecentProjectView } from '../src/shared/project';

const runtime = !app.isPackaged && process.env.UI_EDITOR_USER_DATA
  ? process.env.UI_EDITOR_USER_DATA
  : join(app.isPackaged ? dirname(dirname(process.execPath)) : join(__dirname, '..', 'ToolRuntime'), 'Runtime');
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
    void window.loadURL(source);
  });
  app.on('window-all-closed', () => app.quit());
}
