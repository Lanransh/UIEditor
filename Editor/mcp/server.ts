import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { definitions, validateTool } from '../src/shared/automation-tools';
import { openEditor, requestEditor } from './editor-launch';
import { loadDocumentation } from './documentation';
import { documentationInstructions } from '../src/shared/documentation';

export { definitions } from '../src/shared/automation-tools';
let documentation: ReturnType<typeof loadDocumentation> | undefined;
function docs() { return documentation ??= loadDocumentation(fileURLToPath(new URL('./ai-docs/', import.meta.url))); }
export async function callTool(name: string, args: Record<string, unknown>, discoveryPath: string): Promise<{
  content: Array<{ type: string; text?: string; mimeType?: string; data?: string }>;
  structuredContent?: unknown;
}> {
  validateTool(name, args);
  const result = { value: name === 'uie.docs.read' ? (await docs()).read(args) : name === 'uie.docs.search' ? await (await docs()).search(args)
    : name === 'uie.project.open' ? await openEditor(args, discoveryPath) : await requestEditor(name, args, discoveryPath) };
  if (result.value?.png) return { content: [{ type: 'image', mimeType: 'image/png', data: result.value.png }, { type: 'text', text: JSON.stringify(result.value.metadata) }] };
  if (name === 'uie.assets.get' && result.value?.asset?.previewImage) {
    const { previewImage, ...asset } = result.value.asset;
    const match = /^data:(image\/[^;]+);base64,(.+)$/.exec(previewImage.dataUrl);
    if (match) return { content: [{ type: 'image', mimeType: match[1], data: match[2] }, { type: 'text', text: JSON.stringify({ ...result.value, asset: { ...asset, previewImage: { name: previewImage.name } } }) }] };
  }
  return {
    content: [{ type: 'text', text: name === 'uie.docs.read'
      ? result.value.documents.map((document: { file: string }) => `读取了 ${document.file} 文件`).join('\n')
      : JSON.stringify(result.value) }],
    ...(name === 'uie.docs.read' ? { structuredContent: result.value } : {}),
  };
}
export async function serve(discoveryPath: string) {
  void docs().catch(() => {}); // Freeze one startup snapshot; discovery still works if the package is broken.
  const lines = createInterface({ input: process.stdin }); let queue = Promise.resolve();
  const pending = new Set<Promise<void>>();
  async function handle(line: string, request: any) {
    try {
      request ??= JSON.parse(line); if (request.id === undefined) return;
      let result: unknown;
      if (request.method === 'initialize') result = { protocolVersion: request.params?.protocolVersion ?? '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'ui-editor', version: '0.1.0' }, instructions: documentationInstructions };
      else if (request.method === 'tools/list') result = { tools: definitions };
      else if (request.method === 'ping') result = {};
      else if (request.method === 'tools/call') {
        try { result = await callTool(request.params.name, request.params.arguments ?? {}, discoveryPath); }
        catch (error) { result = { isError: true, content: [{ type: 'text', text: String(error) }] }; }
      } else { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found' } }) + '\n'); return; }
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
    } catch (error) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32700, message: String(error) } }) + '\n'); }
  }
  lines.on('line', line => {
    let request: any;
    try { request = JSON.parse(line); } catch { /* handle reports malformed JSON. */ }
    const name = request?.method === 'tools/call' ? request.params?.name : undefined;
    const independent = name === 'uie.docs.read' || name === 'uie.docs.search';
    const task = independent ? handle(line, request) : queue.then(() => handle(line, request));
    if (!independent) queue = task;
    pending.add(task);
    void task.finally(() => pending.delete(task));
  });
  await new Promise<void>(resolve => lines.once('close', resolve));
  await Promise.all(pending); // EOF closes input, not work already accepted.
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const index = process.argv.indexOf('--discovery');
  if (index < 0 || !process.argv[index + 1]) throw new Error('--discovery path is required');
  await serve(process.argv[index + 1]);
}
