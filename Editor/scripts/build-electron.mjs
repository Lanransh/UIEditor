import { build } from 'esbuild';
import './build-mcp.mjs';

// Embed the same UIEditor-owned class that is sent to Toolkit.
await import('./build-runtime-hosts.mjs');

await build({
  entryPoints: ['electron/main.ts', 'electron/preload.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron'],
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
});
