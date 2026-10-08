import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { robloxStrategy } from '../src/editor/roblox';
import { allNodes, findNode, updateNode, type PropertyValue, type UIDocument, type UINode } from '../src/shared/uiDocument';
import { applyRuntimePatch, mouseEvents, validateJSON, type RuntimePatch, type RuntimeFrame, type RuntimeLog } from '../src/shared/runtime';

export class RuntimeError extends Error {
  constructor(message: string, readonly logs: RuntimeLog[]) { super(message); }
}
function readLogs(source: unknown): RuntimeLog[] {
  validateJSON(source);
  if (!Array.isArray(source)) throw new Error('无效的运行日志。');
  return source.map(log => {
    if (!['output', 'warning', 'action', 'input'].includes(log.kind) || typeof log.message !== 'string') throw new Error('无效的运行日志。');
    return { kind: log.kind, message: log.payload === undefined ? log.message : `${log.message} ${JSON.stringify(log.payload)}` };
  });
}

export class LuauSession {
  readonly id = randomUUID();
  onEnded?: (error: string, logs: RuntimeLog[]) => void;
  private process: ChildProcessWithoutNullStreams;
  private pending: { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  private closed = false;
  private document: UIDocument;
  private disabled: string[] = [];
  private listeners: Record<string, string[]> | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private constructor(directory: string, document: UIDocument) {
    this.document = structuredClone(document);
    this.process = spawn(join(directory, 'ui-luau.exe'), [], { windowsHide: true, stdio: 'pipe' });
    const lines = createInterface({ input: this.process.stdout });
    lines.on('line', line => {
      const pending = this.pending;
      if (!pending) { this.abort(new Error('运行时返回了未请求的消息。')); return; }
      clearTimeout(pending.timer); this.pending = null;
      try {
        const result = JSON.parse(line);
        if (!result.ok) throw new RuntimeError(result.error, readLogs(result.logs ?? []));
        pending.resolve(result.value);
      } catch (error) { pending.reject(error as Error); this.abort(error as Error); }
    });
    this.process.on('error', error => this.abort(error));
    this.process.on('exit', () => this.abort(new Error('Luau 运行进程已退出。')));
    this.process.stderr.on('data', () => { /* Native diagnostics must not block the child pipe. */ });
  }
  static async start(directory: string, source: unknown) {
    const document = robloxStrategy.validate(source);
    let bootstrap: string;
    try {
      await access(join(directory, 'ui-luau.exe'));
      bootstrap = await readFile(join(directory, 'bootstrap.luau'), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('Luau 运行宿主缺失，请在 Editor 目录执行 npm run build:runtime。');
      throw error;
    }
    const session = new LuauSession(directory, document);
    const nodes = Object.fromEntries(allNodes(document.root).map(node => [node.id, { ...node, children: node.children.map(child => child.id), definitions: robloxStrategy.nodes[node.className].properties }]));
    const enums = Object.fromEntries(Object.values(robloxStrategy.nodes).flatMap(node => Object.entries(node.properties).filter(([, definition]) => definition.kind === 'enum').map(([name, definition]) => [name, definition.choices])));
    try {
      const frame = await session.command({ type: 'start', bootstrap, source: document.scripts.source, integration: document.scripts.integration, enums, nodes, root: document.root.id });
      return { session, frame };
    } catch (error) { session.abort(error as Error); throw error; }
  }
  command(command: unknown): Promise<RuntimeFrame> {
    const operation = this.queue.then(async () => {
      if (this.closed) throw new Error('运行会话已结束。');
      if (!command || typeof command !== 'object') throw new Error('运行命令无效。');
      const input = command as Record<string, unknown>;
      if (input.type === 'event') {
        const target = allNodes(this.document.root).find(node => node.id === input.node);
        if (!target || !['TextButton', 'ImageButton'].includes(target.className)) throw new Error('无效的按钮事件。');
        const visible = (node: typeof target, shown: boolean): boolean => {
          const enabled = shown && (node.className === 'ScreenGui' ? !!node.properties.Enabled : node.properties.Visible !== false);
          if (node.id === target.id) return enabled;
          return node.children.some(child => visible(child, enabled));
        };
        if (!visible(this.document.root, true) || this.disabled.includes(target.id)) return { document: this.document, disabled: this.disabled, logs: [], listeners: this.listeners };
      } else if (input.type === 'mouse') {
        const target = typeof input.node === 'string' && findNode(this.document.root, input.node);
        if (!target || robloxStrategy.nodes[target.className].category !== 'object' || !mouseEvents.includes(input.event as any)
          || ['x', 'y', 'dx', 'dy'].some(key => typeof input[key] !== 'number' || !Number.isFinite(input[key]))
          || ![-1, 0, 1, 2].includes(input.button as number) || (input.cancelled !== undefined && typeof input.cancelled !== 'boolean') || (input.wheel !== undefined && typeof input.wheel !== 'boolean')) throw new Error('无效的鼠标输入。');
        const shown = (node: UINode, visible: boolean): boolean => {
          visible = visible && (node.className === 'ScreenGui' ? node.properties.Enabled === true : node.properties.Visible !== false);
          return node.id === target.id ? visible : node.children.some(child => shown(child, visible));
        };
        if (!['MouseLeave', 'InputEnded'].includes(String(input.event)) && (!shown(this.document.root, true) || this.disabled.includes(target.id))) return { document: this.document, disabled: this.disabled, logs: [], listeners: this.listeners };
      } else if (input.type === 'set') {
        const target = typeof input.node === 'string' && findNode(this.document.root, input.node);
        if (!target || typeof input.property !== 'string' || (input.property !== 'Name' && !Object.hasOwn(target.properties, input.property))) throw new Error('无效的运行节点属性。');
        const property = input.property, value = input.value as PropertyValue;
        robloxStrategy.validate({ ...this.document, root: updateNode(this.document.root, target.id, node => property === 'Name'
          ? { ...node, name: value as string }
          : { ...node, properties: { ...node.properties, [property]: value } }) });
      } else if (!['start', 'stop', 'show', 'hide'].includes(input.type as string)) throw new Error('不支持的运行命令。');
      const line = JSON.stringify(command);
      if (Buffer.byteLength(line) > 8 * 1024 * 1024) throw new Error('运行消息超过 8 MiB。');
      try {
        const result = await new Promise<unknown>((resolve, reject) => {
          const timer = setTimeout(() => this.abort(new Error('Luau 运行超时，会话已结束。')), 2000);
          this.pending = { resolve, reject, timer };
          this.process.stdin.write(line + '\n', error => { if (error) this.abort(error); });
        });
        return this.apply(result);
      } catch (error) { this.abort(error as Error); throw error; }
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  private apply(source: unknown): RuntimeFrame {
    validateJSON(source);
    const result = source as { root?: UINode; patch?: RuntimePatch; disabled: string[]; listeners?: Record<string, string[]>; logs: { kind: string; message: string; payload?: unknown }[] };
    if ((!result.root && !result.patch) || (result.root && result.patch) || !Array.isArray(result.disabled) || !Array.isArray(result.logs)) throw new Error('无效的运行结果。');
    const normalize = (node: UINode) => { if (!Array.isArray(node.children) && node.children && Object.keys(node.children).length === 0) node.children = []; if (Array.isArray(node.children)) node.children.forEach(normalize); };
    if (result.root) normalize(result.root);
    const document = result.root ? { ...this.document, root: result.root } : applyRuntimePatch(this.document, result.patch);
    const validated = robloxStrategy.validate(document);
    for (const id of result.disabled) if (typeof id !== 'string' || !findNode(document.root, id)) throw new Error('无效的禁用节点。');
    if (result.listeners !== undefined) {
      if (!result.listeners || typeof result.listeners !== 'object' || Array.isArray(result.listeners)) throw new Error('无效的运行事件订阅。');
      for (const [id, events] of Object.entries(result.listeners)) {
        const node = findNode(validated.root, id);
        if (!node || !Array.isArray(events) || events.some(event => typeof event !== 'string' || !(event === 'Activated' || mouseEvents.includes(event as any) || event.startsWith('property:') && Object.hasOwn(node.properties, event.slice(9))))) throw new Error('无效的运行事件订阅。');
      }
    }
    const logs = readLogs(result.logs);
    this.document = validated; this.disabled = result.disabled; this.listeners = result.listeners;
    return { document: validated, disabled: result.disabled, logs, listeners: result.listeners, ...(result.patch ? { patch: result.patch } : {}) };
  }
  async stop() {
    if (this.closed) return;
    try { await this.command({ type: 'stop' }); } finally { this.abort(new Error('运行已停止。')); }
  }
  abort(error = new Error('运行会话已结束。')) {
    if (this.closed) return;
    this.closed = true;
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = null; }
    this.process.kill();
    this.onEnded?.(error.message, error instanceof RuntimeError ? error.logs : []);
  }
}
