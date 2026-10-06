import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { robloxStrategy } from '../src/editor/roblox';
import { allNodes, findNode, type UIDocument } from '../src/shared/uiDocument';
import { validateJSON, validateReferences, type RuntimeFrame } from '../src/shared/runtime';

export class LuauSession {
  readonly id = randomUUID();
  onEnded?: (error: string) => void;
  private process: ChildProcessWithoutNullStreams;
  private pending: { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  private closed = false;
  private document: UIDocument;
  private disabled: string[] = [];
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
        if (!result.ok) throw new Error(result.error);
        pending.resolve(result.value);
      } catch (error) { pending.reject(error as Error); this.abort(error as Error); }
    });
    this.process.on('error', error => this.abort(error));
    this.process.on('exit', () => this.abort(new Error('Luau 运行进程已退出。')));
    this.process.stderr.on('data', () => { /* Native diagnostics must not block the child pipe. */ });
  }
  static async start(directory: string, source: unknown) {
    const document = robloxStrategy.validate(source);
    validateReferences(document);
    let bootstrap: string;
    try {
      await access(join(directory, 'ui-luau.exe'));
      bootstrap = await readFile(join(directory, 'bootstrap.luau'), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('Luau 运行宿主缺失，请在 Editor 目录执行 npm run build:runtime。');
      throw error;
    }
    const session = new LuauSession(directory, document);
    const nodes = Object.fromEntries(allNodes(document.root).map(node => [node.id, { className: node.className, properties: node.properties }]));
    try {
      const frame = await session.command({ type: 'start', bootstrap, config: document.scripts.config, source: document.scripts.source, nodes, references: document.scripts.references, state: document.scripts.state });
      return { session, frame };
    } catch (error) { session.abort(error as Error); throw error; }
  }
  command(command: unknown): Promise<RuntimeFrame> {
    const operation = this.queue.then(async () => {
      if (this.closed) throw new Error('运行会话已结束。');
      if (!command || typeof command !== 'object') throw new Error('运行命令无效。');
      const input = command as Record<string, unknown>;
      if (input.type === 'state') validateJSON(input.state);
      else if (input.type === 'event') {
        const target = allNodes(this.document.root).find(node => node.id === input.node);
        if (!target || !['TextButton', 'ImageButton'].includes(target.className)) throw new Error('无效的按钮事件。');
        const visible = (node: typeof target, shown: boolean): boolean => {
          const enabled = shown && (node.className === 'ScreenGui' ? !!node.properties.Enabled : node.properties.Visible !== false);
          if (node.id === target.id) return enabled;
          return node.children.some(child => visible(child, enabled));
        };
        if (!visible(this.document.root, true) || this.disabled.includes(target.id)) return { document: this.document, disabled: this.disabled, logs: [] };
      } else if (!['start', 'stop'].includes(input.type as string)) throw new Error('不支持的运行命令。');
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
    const result = source as { operations: { node: string; property: string; value: unknown }[]; disabled: string[]; logs: { kind: string; message: string; payload?: unknown }[] };
    if (!Array.isArray(result.operations) || !Array.isArray(result.disabled) || !Array.isArray(result.logs)) throw new Error('无效的运行结果。');
    const document = structuredClone(this.document);
    for (const operation of result.operations) {
      const node = findNode(document.root, operation.node);
      if (!node || !Object.hasOwn(node.properties, operation.property)) throw new Error(`不支持的运行属性 ${operation.property}`);
      node.properties[operation.property] = operation.value as typeof node.properties[string];
    }
    const validated = robloxStrategy.validate(document);
    for (const id of result.disabled) if (typeof id !== 'string' || !findNode(document.root, id)) throw new Error('无效的禁用节点。');
    const logs = result.logs.map(log => {
      if (!['output', 'action'].includes(log.kind) || typeof log.message !== 'string') throw new Error('无效的运行日志。');
      return { kind: log.kind as 'output' | 'action', message: log.payload === undefined ? log.message : `${log.message} ${JSON.stringify(log.payload)}` };
    });
    this.document = validated; this.disabled = result.disabled;
    return { document: validated, disabled: result.disabled, logs };
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
    this.onEnded?.(error.message);
  }
}
