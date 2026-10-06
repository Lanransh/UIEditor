import { packager } from '@electron/packager';
import { resolve } from 'node:path';
import { access } from 'node:fs/promises';

await access(resolve('native-bin/ui-luau.exe'));
await access(resolve('native-bin/bootstrap.luau'));

process.env.ELECTRON_MIRROR ??= 'https://npmmirror.com/mirrors/electron/';

const paths = await packager({
  dir: '.',
  out: '../ToolRuntime',
  name: 'UIEditor',
  executableName: 'UIEditor',
  icon: resolve('public/app-icon.ico'),
  platform: 'win32',
  arch: 'x64',
  asar: true,
  extraResource: ['native-bin'],
  overwrite: true,
  download: { cacheRoot: resolve('../ToolRuntime/Runtime/ElectronDownloadCache') },
  ignore: [/^\/(src|electron|scripts|tests|test-results|docs|native|native-bin|\.agents|\.cache|ToolRuntime)(\/|$)/, /^\/(AGENTS\.md|tsconfig\.json|vite\.config\.ts|index\.html|Run\.bat|BuildAndRun\.bat)$/],
});
console.log(paths.join('\n'));
