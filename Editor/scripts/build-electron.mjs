import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import './build-mcp.mjs';

// Lua hosts are source files; keep existing native binaries usable after host edits.
await mkdir('native-bin', { recursive: true });
await Promise.all(['bootstrap.luau', 'editor.luau'].map(name => copyFile(`native/${name}`, `native-bin/${name}`)));

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
