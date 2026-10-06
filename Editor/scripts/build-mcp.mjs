import { build } from 'esbuild';
await build({ entryPoints: ['mcp/server.ts'], bundle: true, platform: 'node', target: 'node22', format: 'esm', outfile: 'mcp-dist/server.mjs' });
