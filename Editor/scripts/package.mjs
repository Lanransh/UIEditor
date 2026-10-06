import { packager } from '@electron/packager';
import { resolve } from 'node:path';
import { access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

await access(resolve('native-bin/ui-luau.exe'));
await access(resolve('native-bin/bootstrap.luau'));
await access(resolve('native-bin/editor.luau'));
await access(resolve('mcp-dist/server.mjs'));

process.env.ELECTRON_MIRROR ??= 'https://npmmirror.com/mirrors/electron/';
const output = process.env.UI_EDITOR_PACKAGE_OUTPUT || '../ToolRuntime';
if (process.platform === 'win32') {
  // Check before packager removes files: a running copy locks only some DLLs,
  // so waiting for unlink to fail would leave an incomplete application directory.
  const processes = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Process -Name UIEditor -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path | ConvertTo-Json -Compress; exit 0'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  if (processes.error || processes.status !== 0) throw new Error('无法检查运行中的 UIEditor，未替换应用目录。');
  const paths = processes.stdout.trim() ? JSON.parse(processes.stdout) : [];
  const executable = resolve(output, 'UIEditor-win32-x64/UIEditor.exe').toLowerCase();
  if ((Array.isArray(paths) ? paths : [paths]).some(path => typeof path === 'string' && resolve(path).toLowerCase() === executable)) throw new Error('目标 UIEditor 正在运行，请关闭后打包，或设置 UI_EDITOR_PACKAGE_OUTPUT 使用隔离目录。未替换应用目录。');
}

const paths = await packager({
  dir: '.',
  out: output,
  name: 'UIEditor',
  executableName: 'UIEditor',
  icon: resolve('public/app-icon.ico'),
  platform: 'win32',
  arch: 'x64',
  asar: true,
  extraResource: ['native-bin', 'mcp-dist'],
  overwrite: true,
  download: { cacheRoot: resolve('../ToolRuntime/Runtime/ElectronDownloadCache') },
  ignore: [/^\/(src|electron|scripts|tests|test-results|docs|native|native-bin|mcp|mcp-dist|\.agents|\.cache|ToolRuntime)(\/|$)/, /^\/(AGENTS\.md|tsconfig\.json|vite\.config\.ts|index\.html|Run\.bat|BuildAndRun\.bat)$/],
});
console.log(paths.join('\n'));
