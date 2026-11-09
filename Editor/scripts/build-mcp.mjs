import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
await mkdir('mcp-dist', { recursive: true });
// Stage a clean package so removed source documents cannot survive the next build.
const docs = resolve('mcp-dist/ai-docs');
if (dirname(docs) !== resolve('mcp-dist')) throw new Error('文档构建目标越界。');
await rm(docs, { recursive: true, force: true });
await cp('ai-docs', 'mcp-dist/ai-docs', { recursive: true });
await build({
  entryPoints: ['mcp/server.ts'], bundle: true, platform: 'node', target: 'node22', format: 'esm', outfile: 'mcp-dist/server.mjs',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
