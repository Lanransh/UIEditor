import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { definitions, validateTool } from '../src/shared/automation-tools';
import { openEditor, requestEditor } from './editor-launch';

export { definitions } from '../src/shared/automation-tools';
export async function callTool(name: string, args: Record<string, unknown>, discoveryPath: string) {
  validateTool(name, args);
  const result = { value: name === 'uie.project.open' ? await openEditor(args, discoveryPath) : await requestEditor(name, args, discoveryPath) };
  if (result.value?.png) return { content: [{ type: 'image', mimeType: 'image/png', data: result.value.png }, { type: 'text', text: JSON.stringify(result.value.metadata) }] };
  if (name === 'uie.assets.get' && result.value?.asset?.previewImage) {
    const { previewImage, ...asset } = result.value.asset;
    const match = /^data:(image\/[^;]+);base64,(.+)$/.exec(previewImage.dataUrl);
    if (match) return { content: [{ type: 'image', mimeType: match[1], data: match[2] }, { type: 'text', text: JSON.stringify({ ...result.value, asset: { ...asset, previewImage: { name: previewImage.name } } }) }] };
  }
  return { content: [{ type: 'text', text: JSON.stringify(result.value) }] };
}
export function serve(discoveryPath: string) {
  const lines = createInterface({ input: process.stdin }); let queue = Promise.resolve();
  lines.on('line', line => { queue = queue.then(async () => {
    let request: any;
    try {
      request = JSON.parse(line); if (request.id === undefined) return;
      let result: unknown;
      if (request.method === 'initialize') result = { protocolVersion: request.params?.protocolVersion ?? '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'ui-editor', version: '0.1.0' } };
      else if (request.method === 'tools/list') result = { tools: definitions };
      else if (request.method === 'ping') result = {};
      else if (request.method === 'tools/call') {
        try { result = await callTool(request.params.name, request.params.arguments ?? {}, discoveryPath); }
        catch (error) { result = { isError: true, content: [{ type: 'text', text: String(error) }] }; }
      } else { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found' } }) + '\n'); return; }
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
    } catch (error) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32700, message: String(error) } }) + '\n'); }
  }); });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const index = process.argv.indexOf('--discovery');
  if (index < 0 || !process.argv[index + 1]) throw new Error('--discovery path is required');
  serve(process.argv[index + 1]);
}
