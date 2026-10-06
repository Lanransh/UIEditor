import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import { join, dirname, basename, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createProject, describeError, openProject, RecentProjects } from './projects';
import type { Project, Result, RecentProjectView } from '../src/shared/project';
import { readDocument, writeDocument, readPreviewImage, safeFileName, listDocumentAssets, openDocumentAsset } from './documents';
import { robloxStrategy } from '../src/editor/roblox';
import { LuauSession, RuntimeError } from './runtime';
import { startBridge } from './automation-bridge';
import { executeCode, getCodeAdapter } from './code-executor';
import { openInterface, saveInterface, listInterfaces } from './automation-files';
import { createCodexMcpSettingsStore } from './codex-mcp-settings.cjs';

const runtime = process.env.UI_EDITOR_USER_DATA
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
  void app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    const window = new BrowserWindow({
      width: 1200, height: 800, minWidth: 900, minHeight: 600,
      title: 'UI 编辑器', backgroundColor: '#f7f8fa', show: false,
      icon: join(__dirname, '../dist/app-icon.png'),
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
    const nativeDirectory = join(__dirname, app.isPackaged ? '../../native-bin' : '../native-bin');
    const discoveryPath = join(runtime, 'ui-editor-automation.json');
    const mcpSettings = createCodexMcpSettingsStore({ serverPath: app.isPackaged ? join(process.resourcesPath, 'mcp-dist/server.mjs') : join(__dirname, '../mcp-dist/server.mjs'), discoveryPath });
    let automationReady = false;
    const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    const consoleLogs: { cursor: number; level: string; message: string }[] = []; let consoleCursor = 0;
    window.webContents.on('console-message', (_event, level, message) => { consoleLogs.push({ cursor: ++consoleCursor, level: String(level), message: message.slice(0, 4096) }); if (consoleLogs.length > 500) consoleLogs.shift(); });
    function cancelAutomation() { automationReady = false; for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('编辑会话已关闭。')); } pending.clear(); }
    ipcMain.on('automation:ready', (event, ready) => { if (trusted(event)) { if (!ready) cancelAutomation(); else automationReady = true; } });
    ipcMain.handle('automation:reply', (event, reply) => {
      if (!trusted(event)) throw new Error('无效来源。');
      const item = pending.get(reply?.requestId); if (!item) return;
      clearTimeout(item.timer); pending.delete(reply.requestId);
      if (reply.ok) item.resolve(reply.value); else item.reject(new Error(reply.error));
    });
    const bridge = await startBridge(discoveryPath, async request => {
      if (!automationReady || window.isDestroyed()) {
        if (request.name === 'uie.debug.get_diagnostics') return { connected: true, state: 'hub', console: consoleLogs, consoleCursor };
        throw new Error('请先打开工程，当前没有编辑会话。');
      }
      const requestId = randomUUID();
      const value = await new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('编辑器操作超时。')); }, 12000);
        pending.set(requestId, { resolve, reject, timer }); window.webContents.send('automation:request', { ...request, requestId });
      });
      const cursor = typeof request.arguments.consoleCursor === 'number' ? request.arguments.consoleCursor : 0;
      return request.name === 'uie.debug.get_diagnostics' ? { ...(value as object), console: consoleLogs.filter(log => log.cursor > cursor), consoleCursor, consoleTruncated: cursor < (consoleLogs[0]?.cursor ?? consoleCursor + 1) - 1 } : value;
    });
    window.on('closed', () => { cancelAutomation(); bridge.close(); });
    window.webContents.on('render-process-gone', cancelAutomation);
    ipcMain.handle('automation:invoke', async (event, input) => {
      if (!trusted(event)) throw new Error('无效来源。');
      const argument = input?.argument;
      switch (input?.operation) {
        case 'settings:get': return mcpSettings.getStatus();
        case 'settings:set': return mcpSettings.setEnabled(argument);
        case 'code': if (!activeProject || !automationReady) throw new Error('请先打开工程。'); return executeCode(getCodeAdapter(activeProject.manifest.mode), nativeDirectory, argument.document, argument.language, argument.source).catch(error => ({ error: error.message, stage: error.stage ?? 'execution', logs: error.logs ?? [] }));
        case 'file:open': { if (!activeProject || !automationReady) throw new Error('请先打开工程。'); const result = await openInterface(activeProject.path, argument.relativePath); documentPath = result.path; return result; }
        case 'file:new': if (!automationReady) throw new Error('请先打开工程。'); documentPath = null; return null;
        case 'file:list': if (!activeProject || !automationReady) throw new Error('请先打开工程。'); return listInterfaces(activeProject.path);
        case 'file:save': {
          if (!activeProject || !automationReady) throw new Error('请先打开工程。');
          const target = argument.relativePath ?? (documentPath ? relative(join(activeProject.path, 'interfaces'), documentPath) : null);
          const result = await saveInterface(activeProject.path, target, robloxStrategy.validate(argument.document), argument.relativePath !== undefined);
          documentPath = result.path; return result;
        }
        case 'screenshot': {
          if (!automationReady) throw new Error('请先打开工程。');
          const { x, y, width, height } = argument.rect;
          if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) throw new Error('画布区域不可见。');
          const image = await window.webContents.capturePage({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) });
          return { png: image.toPNG().toString('base64'), metadata: { width: image.getSize().width, height: image.getSize().height, zoom: argument.zoom } };
        }
        default: throw new Error('不支持的自动化操作。');
      }
    });
    let runtimeSession: LuauSession | null = null;
    let runtimeRevision = 0;
    const stopRuntime = () => { ++runtimeRevision; runtimeSession?.abort(); runtimeSession = null; };
    window.on('closed', stopRuntime);
    window.webContents.on('render-process-gone', stopRuntime);
    ipcMain.handle('runtime:start', async (event, document) => {
      if (!trusted(event) || !activeProject) return { ok: false, error: '无效的运行来源。' };
      stopRuntime();
      const revision = runtimeRevision;
      try {
        const started = await LuauSession.start(join(__dirname, app.isPackaged ? '../../native-bin' : '../native-bin'), document);
        if (revision !== runtimeRevision || window.isDestroyed()) { started.session.abort(); return { ok: false, error: '运行启动已取消。' }; }
        runtimeSession = started.session;
        const session = runtimeSession;
        session.onEnded = (error, logs) => {
          if (runtimeSession === session) {
            runtimeSession = null;
            if (!window.isDestroyed()) window.webContents.send('runtime:ended', { session: session.id, error, logs });
          }
        };
        return { ok: true, value: { session: runtimeSession.id, frame: started.frame } };
      } catch (error) { return { ok: false, error: describeError(error), logs: error instanceof RuntimeError ? error.logs : [] }; }
    });
    ipcMain.handle('runtime:command', async (event, argument) => {
      if (!trusted(event) || !runtimeSession || argument?.session !== runtimeSession.id || argument?.command?.type !== 'event') return { ok: false, error: '运行会话已结束。' };
      const session = runtimeSession;
      try { return { ok: true, value: await session.command(argument.command) }; }
      catch (error) { if (runtimeSession === session) stopRuntime(); return { ok: false, error: describeError(error), logs: error instanceof RuntimeError ? error.logs : [] }; }
    });
    ipcMain.handle('runtime:stop', async (event, id) => {
      if (!trusted(event)) return { ok: false, error: '无效的运行来源。' };
      if (runtimeSession && runtimeSession.id === id) {
        const session = runtimeSession;
        runtimeSession = null;
        try { await session.stop(); } catch (error) { return { ok: false, error: describeError(error) }; }
      }
      return { ok: true, value: null };
    });
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
      stopRuntime();
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
    handle('document:new', async () => { requireProject(); stopRuntime(); documentPath = null; return null; });
    handle('document:list-assets', async () => listDocumentAssets(requireProject().path));
    handle('document:open', async assetPath => {
      stopRuntime();
      const project = requireProject();
      if (assetPath !== undefined) {
        const file = await openDocumentAsset(project.path, assetPath);
        documentPath = file.path;
        return file;
      }
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
