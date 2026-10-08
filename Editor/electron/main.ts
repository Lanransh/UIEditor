import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { join, dirname, basename, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createProject, describeError, openProject, RecentProjects } from './projects';
import type { Project, Result, RecentProjectView } from '../src/shared/project';
import { readDocument, writeDocument, readPreviewImage, safeFileName, listDocumentAssets, openDocumentAsset, moveDocumentAsset, listTemplateFolders, templateFolderPath, documentAssetDirectory } from './documents';
import { robloxStrategy } from '../src/editor/roblox';
import { LuauSession, RuntimeError } from './runtime';
import { ToolkitClient } from './toolkit';
import { AutomationReader } from './automation-reader';
import { getNode, nodeTree, findNodes, integer } from '../src/shared/automation';
import type { UIDocument } from '../src/shared/uiDocument';
import { startBridge } from './automation-bridge';
import { executeCode, getCodeAdapter } from './code-executor';
import { openInterface, saveInterface } from './automation-files';
import { createCodexMcpSettingsStore } from './codex-mcp-settings.cjs';
import { ImageAssetStore, permanentImageRoot } from './image-assets';
import { syncAgentWorkspace } from './agent-workspace';
import { ensureWorkspaceLauncher } from './workspace-launcher';
import { listTemplateStyles, previewTemplateStyle, styleDirectory, templateStylesDirectory } from './template-styles';
import { resolveImageAssets, type ImageAssetUpdate, type ImageLibrary } from '../src/shared/imageAssets';

const runtime = process.env.UI_EDITOR_USER_DATA
  ? process.env.UI_EDITOR_USER_DATA
  : join(app.isPackaged ? dirname(dirname(process.execPath)) : join(__dirname, '..', '..', 'ToolRuntime'), 'Runtime');
const permanentImages = permanentImageRoot(app.isPackaged, app.getAppPath(), process.execPath, process.env.UI_EDITOR_USER_DATA);
for (const name of ['userData', 'sessionData', 'logs', 'crashDumps'] as const) {
  const directory = join(runtime, name);
  mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
}

const startupWorkspace = process.env.UI_EDITOR_OPEN_WORKSPACE;
const background = process.env.UI_EDITOR_BACKGROUND === '1';
delete process.env.UI_EDITOR_OPEN_WORKSPACE;
if (!app.requestSingleInstanceLock({ workspacePath: startupWorkspace ?? null })) {
  app.quit();
} else {
  void app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    const window = new BrowserWindow({
      width: 1200, height: 800, minWidth: 900, minHeight: 600,
      title: 'UI 编辑器', backgroundColor: '#f7f8fa', show: false,
      skipTaskbar: background, focusable: !background,
      icon: join(__dirname, '../dist/app-icon.png'),
      webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: !background },
    });
    app.on('second-instance', (_event, _argv, _cwd, data) => {
      if (!background) {
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
      }
      const path = (data as { workspacePath?: unknown } | null)?.workspacePath;
      if (typeof path !== 'string') return;
      void (async () => {
        if (dirty || busy) throw new Error('请先保存当前界面并完成当前操作，再运行工作区 Run.bat。');
        busy = true;
        try { window.webContents.send('project:activated', await remember(await openProject(path))); }
        finally { busy = false; }
      })().catch(error => dialog.showMessageBox(window, { type: 'error', title: '无法打开工作区', message: describeError(error) }));
    });
    if (!background) window.once('ready-to-show', () => window.show());
    const source = !app.isPackaged && process.env.UI_EDITOR_DEV_URL
      ? process.env.UI_EDITOR_DEV_URL : pathToFileURL(join(__dirname, '../dist/index.html')).href;
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    const recent = new RecentProjects(runtime);
    const stylesRoot = templateStylesDirectory(app.isPackaged, app.getAppPath(), process.execPath);
    async function styles() {
      return listTemplateStyles(stylesRoot);
    }
    let activeProject: Project | null = null;
    const reader = new AutomationReader(runtime, recent, () => automationReady ? activeProject : null, permanentImages);
    const previews = new Map<Electron.WebContents, { document: UIDocument; ready(): void }>();
    async function savedScreenshot(document: UIDocument, target: object) {
      const preview = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, show: false, skipTaskbar: true, focusable: false,
        webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
      preview.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      preview.webContents.on('will-navigate', event => event.preventDefault());
      const url = new URL(source); url.searchParams.set('uiePreview', '1');
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const ready = new Promise<void>((resolve, reject) => {
          timer = setTimeout(() => reject(new Error('模板截图渲染超时。')), 10000);
          previews.set(preview.webContents, { document, ready: resolve });
        });
        // Attach the readiness wait before navigation so a load failure cannot leave a rejected promise unhandled.
        await Promise.all([preview.loadURL(url.href), ready]);
        const captured = await preview.webContents.capturePage({ x: 0, y: 0, width: 1280, height: 720 });
        const image = captured.resize({ width: 1280, height: 720, quality: 'best' });
        return { png: image.toPNG().toString('base64'), metadata: { width: image.getSize().width, height: image.getSize().height, zoom: 1, target, view: 'saved-design' } };
      } finally { if (timer) clearTimeout(timer); previews.delete(preview.webContents); preview.destroy(); }
    }
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
      const a = request.arguments;
      if (request.name === 'uie.project.list') return reader.listProjects();
      if (request.name === 'uie.document.list' && (a.projectId !== undefined || a.library === 'permanent' || !automationReady)) return reader.listDocuments(a);
      if (a.target !== undefined) {
        const saved = await reader.read(a.target);
        switch (request.name) {
          case 'uie.nodes.get': return { target: saved.target, ...(a.format === 'tree' ? nodeTree(saved.document, a) : { node: getNode(saved.document, a) }) };
          case 'uie.nodes.find': return { target: saved.target, ...findNodes(saved.document, a) };
          case 'uie.scripts.get': return { target: saved.target, scripts: a.kind === undefined ? saved.document.scripts : { [String(a.kind)]: saved.document.scripts[a.kind as 'source' | 'integration'] } };
          case 'uie.debug.screenshot': return savedScreenshot(saved.document, saved.target);
        }
      }
      if (['uie.assets.search', 'uie.assets.get'].includes(request.name) && (a.projectId !== undefined || a.library === 'permanent')) {
        const { assets, projectId } = await reader.images(a);
        if (request.name === 'uie.assets.get') {
          const asset = assets.find(asset => asset.id === a.id);
          if (!asset) throw new Error('图片资产不存在。');
          return { projectId, asset: { ...asset, permission: 'unverified' } };
        }
        const query = String(a.query ?? '').toLowerCase();
        const matches = assets.filter(asset => `${asset.name} ${asset.tags}`.toLowerCase().includes(query));
        const offset = integer(a.offset, 0, 0, 10000), limit = integer(a.limit, 50, 1, 200);
        return { projectId, assets: matches.slice(offset, offset + limit).map(({ previewImage: _, ...asset }) => asset), total: matches.length, nextOffset: offset + limit < matches.length ? offset + limit : null };
      }
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
      if (request.name === 'uie.runtime.batch') {
        const batch = value as { diagnostics: object };
        return { ...batch, diagnostics: { ...batch.diagnostics, console: consoleLogs, consoleCursor } };
      }
      return request.name === 'uie.debug.get_diagnostics' ? { ...(value as object), console: consoleLogs.filter(log => log.cursor > cursor), consoleCursor, consoleTruncated: cursor < (consoleLogs[0]?.cursor ?? consoleCursor + 1) - 1 } : value;
    });
    window.on('closed', () => { cancelAutomation(); bridge.close(); });
    window.webContents.on('render-process-gone', cancelAutomation);
    ipcMain.handle('automation:invoke', async (event, input) => {
      const preview = previews.get(event.sender);
      if (preview && event.senderFrame === event.sender.mainFrame && new URL(event.senderFrame.url).searchParams.get('uiePreview') === '1') {
        if (input?.operation === 'preview:document') return preview.document;
        if (input?.operation === 'preview:ready') { preview.ready(); return null; }
        throw new Error('截图窗口只允许读取预览。');
      }
      if (!trusted(event)) throw new Error('无效来源。');
      const argument = input?.argument;
      switch (input?.operation) {
        case 'settings:get': return mcpSettings.getStatus();
        case 'settings:set': return mcpSettings.setEnabled(argument);
        case 'code': {
          if (!activeProject || !automationReady) throw new Error('请先打开工程。');
          const assets = await new ImageAssetStore(runtime, activeProject.path, permanentImages).list();
          return executeCode(getCodeAdapter(activeProject.manifest.mode), nativeDirectory, argument.document, argument.language, argument.source, assets).catch(error => ({ error: error.message, stage: error.stage ?? 'execution', logs: error.logs ?? [] }));
        }
        case 'file:open': { if (!activeProject || !automationReady) throw new Error('请先打开工程。'); const result = await openInterface(activeProject.path, argument.relativePath); documentPath = result.path; return result; }
        case 'file:list': return reader.listDocuments(argument ?? {});
        case 'file:new': if (!automationReady) throw new Error('请先打开工程。'); documentPath = null; return null;
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
        const assets = await new ImageAssetStore(runtime, activeProject.path, permanentImages).list();
        const started = await LuauSession.start(join(__dirname, app.isPackaged ? '../../native-bin' : '../native-bin'), resolveImageAssets(robloxStrategy.validate(document), assets));
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
      if (!trusted(event) || !runtimeSession || argument?.session !== runtimeSession.id || !['event', 'show', 'hide', 'set'].includes(argument?.command?.type)) return { ok: false, error: '运行会话已结束。' };
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
      await syncAgentWorkspace(project.path, join(app.isPackaged ? process.resourcesPath : dirname(app.getAppPath()), 'ProjectTypes', 'Roblox'));
      await ensureWorkspaceLauncher(project.path, process.execPath, app.isPackaged ? undefined : app.getAppPath());
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
    handle('project:list-styles', styles);
    handle('project:preview-style', async id => {
      return previewTemplateStyle(stylesRoot, id);
    });
    handle('project:create', async input => {
      let source: string | undefined;
      let style: string | undefined;
      if (typeof input === 'string') source = await recent.resolveRecent(input);
      else if (input !== undefined) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('模板来源无效。');
        const value = input as Record<string, unknown>;
        if (value.kind === 'recent' && Object.keys(value).every(key => ['kind', 'path'].includes(key))) source = await recent.resolveRecent(value.path);
        else if (value.kind === 'style' && Object.keys(value).every(key => ['kind', 'id'].includes(key))) style = styleDirectory(stylesRoot, value.id);
        else throw new Error('模板来源无效；模板风格与历史工程克隆不能同时使用。');
      }
      const parent = await pick('选择父文件夹 — 将自动创建 UIEditorWorkspace');
      if (!parent) return null;
      const result = await createProject(parent, source, style, join(app.isPackaged ? process.resourcesPath : dirname(app.getAppPath()), 'ProjectTypes', 'Roblox'));
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
    let startupConsumed = false;
    handle('project:open-startup', async () => {
      if (startupConsumed) return null;
      startupConsumed = true;
      return startupWorkspace ? remember(await openProject(startupWorkspace)) : null;
    });
    handle('project:list-recent', recentViews);
    handle('project:remove-recent', async path => { await recent.remove(await recent.resolveRecent(path)); return recentViews(); });
    const requireProject = () => { if (!activeProject) throw new Error('请先打开工程。'); return activeProject; };
    const toolkit = new ToolkitClient();
    handle('toolkit:discover', async () => toolkit.discover());
    handle('toolkit:image-targets', async () => toolkit.imageTargets(requireProject().path));
    handle('toolkit:image-upload', async argument => {
      const value = argument as { targetId: string; assetId: string };
      const asset = (await imageStore().list()).find(asset => asset.id === value.assetId);
      if (!asset) throw new Error('图片资产不存在。');
      return toolkit.uploadImage(value.targetId, asset.name, asset.previewImage.dataUrl);
    });
    handle('toolkit:image-task', async argument => {
      requireProject();
      const value = argument as { targetId: string; taskId: string };
      return toolkit.imageTask(value.targetId, value.taskId);
    });
    handle('toolkit:submit', async argument => {
      requireProject();
      const value = argument as { targetId: string; document: unknown };
      return toolkit.submit(value.targetId, resolveImageAssets(robloxStrategy.validate(value.document), await imageStore().list()));
    });
    handle('toolkit:task', async argument => {
      const value = argument as { targetId: string; taskId: string; action: string };
      return toolkit.task(value.targetId, value.taskId, value.action);
    });

    handle('document:new', async () => { requireProject(); stopRuntime(); documentPath = null; return null; });
    const documentStorage = (library: unknown) => {
      const project = requireProject();
      if (library === undefined || library === 'project') return { root: project.path, library: 'project' as const };
      if (library === 'templates') return { root: project.path, library: 'templates' as const };
      if (library === 'permanent') return { root: runtime, library: 'permanent' as const };
      throw new Error('UI 资产库无效。');
    };
    handle('document:list-assets', async library => {
      const storage = documentStorage(library);
      return listDocumentAssets(storage.root, storage.library);
    });
    // Read-only thumbnails may load concurrently without occupying the file-operation lock.
    ipcMain.handle('document:preview-asset', async (event, argument) => {
      if (!trusted(event)) return { ok: false, error: '无效的操作来源。' };
      try {
        if (!argument || typeof argument !== 'object') throw new Error('预览参数无效。');
        const storage = documentStorage(argument.library);
        return { ok: true, value: await openDocumentAsset(storage.root, argument.path, storage.library) };
      }
      catch (error) { return { ok: false, error: describeError(error) }; }
    });
    handle('document:open-template', async argument => {
      if (!argument || typeof argument !== 'object' || !('library' in argument) || !('path' in argument) || !['templates', 'permanent'].includes(String(argument.library))) throw new Error('UI 资产库无效。');
      const storage = documentStorage(argument.library);
      const file = await openDocumentAsset(storage.root, argument.path, storage.library);
      stopRuntime(); documentPath = null;
      return file;
    });
    handle('document:move-asset', async argument => {
      if (!argument || typeof argument !== 'object' || !('path' in argument) || !('source' in argument) || !('target' in argument)) throw new Error('移动参数无效。');
      if (!['project', 'templates', 'permanent'].includes(String(argument.source)) || !['project', 'templates', 'permanent'].includes(String(argument.target))) throw new Error('UI 资产库无效。');
      const source = documentStorage(argument.source), target = documentStorage(argument.target);
      const asset = await moveDocumentAsset(source.root, argument.path, source.library, target.root, target.library);
      if (documentPath === argument.path) documentPath = asset.path;
      return asset;
    });
    ipcMain.handle('document:template-folders', async event => {
      if (!trusted(event)) return { ok: false, error: '无效的操作来源。' };
      try { return { ok: true, value: await listTemplateFolders(requireProject().path) }; }
      catch (error) { return { ok: false, error: describeError(error) }; }
    });
    handle('document:create-template-folder', async name => {
      const project = requireProject();
      await mkdir(documentAssetDirectory(project.path, 'templates'), { recursive: true });
      await mkdir(templateFolderPath(project.path, name));
      return null;
    });
    handle('document:save-template', async argument => {
      const project = requireProject();
      const { document: source, folder } = argument as { document: unknown; folder?: string };
      const document = robloxStrategy.validate(source);
      const directory = folder === undefined || folder === '' ? documentAssetDirectory(project.path, 'templates') : templateFolderPath(project.path, folder);
      if (folder && !(await listTemplateFolders(project.path)).includes(folder)) throw new Error('模板文件夹不存在，请刷新后重试。');
      const path = join(directory, `${safeFileName(document.name)}.rbxui.json`);
      const exists = await stat(path).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
      if (exists) {
        const answer = await dialog.showMessageBox(window, { type: 'question', title: '模板参考已存在', message: '是否覆盖同名模板参考？', detail: path, buttons: ['覆盖', '取消'], defaultId: 1, cancelId: 1 });
        if (answer.response !== 0) return null;
      }
      return { path, document: await writeDocument(path, document) };
    });
    const imageStore = () => new ImageAssetStore(runtime, requireProject().path, permanentImages);
    handle('images:list', async () => imageStore().list());
    handle('images:update', async input => imageStore().update(input as ImageAssetUpdate));
    handle('images:update-roblox-id', async input => {
      const value = input as Pick<ImageAssetUpdate, 'id' | 'robloxId'>;
      if (!value) throw new Error('图片资产配置无效。');
      return imageStore().updateRobloxId(value.id, value.robloxId);
    });
    handle('images:open-directory', async id => {
      if (typeof id !== 'string') throw new Error('图片资产 ID 无效。');
      const error = await shell.openPath(await imageStore().assetDirectory(id));
      if (error) throw new Error(error);
      return null;
    });
    handle('images:import-file', async input => {
      const value = input as { library: ImageLibrary; path: string };
      if (!value || !['permanent', 'project'].includes(value.library) || typeof value.path !== 'string' || !value.path) throw new Error('请拖入本地图片文件。');
      return imageStore().import(value.library, await readPreviewImage(value.path));
    });
    handle('images:import', async library => {
      const store = imageStore();
      if (!['permanent', 'project'].includes(String(library))) throw new Error('图片资产库无效。');
      const result = await dialog.showOpenDialog(window, { title: '导入图片资产（不会上传）', properties: ['openFile'], filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] });
      return result.canceled || !result.filePaths[0] ? null : store.import(library as ImageLibrary, await readPreviewImage(result.filePaths[0]));
    });
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
      if ('projectUI' in argument && typeof argument.projectUI !== 'boolean') throw new Error('保存参数无效。');
      // The destination is issued by the main process, never by a renderer path.
      let path = documentPath;
      const document = robloxStrategy.validate(argument.document);
      if ('projectUI' in argument && argument.projectUI) {
        path = join(project.path, 'interfaces', `${safeFileName(document.name)}.rbxui.json`);
        const exists = await stat(path).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
        if (exists && path !== documentPath) {
          const answer = await dialog.showMessageBox(window, { type: 'question', title: '文件已存在', message: '是否覆盖已有项目UI？', detail: path, buttons: ['覆盖', '取消'], defaultId: 1, cancelId: 1 });
          if (answer.response !== 0) return null;
        }
      } else if (!path || argument.saveAs) {
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
