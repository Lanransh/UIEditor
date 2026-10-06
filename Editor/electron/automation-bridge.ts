import { createServer } from 'node:http';
import { mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { toolNames, type AutomationRequest } from '../src/shared/automation';
import { validateTool } from '../src/shared/automation-tools';

export async function startBridge(discoveryPath: string, dispatch: (request: AutomationRequest) => Promise<unknown>) {
  const token = randomUUID(); let queue: Promise<unknown> = Promise.resolve();
  const server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.method !== 'POST' || request.url !== '/call' || request.headers.authorization !== `Bearer ${token}`) { response.writeHead(403); response.end(JSON.stringify({ ok: false, error: 'Forbidden' })); return; }
    try {
      let body = ''; for await (const chunk of request) { body += chunk; if (Buffer.byteLength(body) > 8 * 1024 * 1024) throw new Error('请求过大。'); }
      const input = JSON.parse(body);
      if (!toolNames.includes(input.name) || !input.arguments || typeof input.arguments !== 'object' || Array.isArray(input.arguments)) throw new Error('无效的 MCP 请求。');
      validateTool(input.name, input.arguments);
      const operation = queue.then(() => dispatch(input)); queue = operation.catch(() => {});
      response.end(JSON.stringify({ ok: true, value: await operation }));
    } catch (error) { response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })); }
  });
  server.requestTimeout = 15000;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('桥接启动失败。');
  await mkdir(dirname(discoveryPath), { recursive: true });
  const temporary = `${discoveryPath}.${token}.tmp`;
  try { await writeFile(temporary, JSON.stringify({ port: address.port, token }), { flag: 'wx' }); await rename(temporary, discoveryPath); }
  catch (error) { server.close(); await unlink(temporary).catch(() => {}); throw error; }
  return { close: () => { server.close(); void unlink(discoveryPath).catch(() => {}); } };
}
