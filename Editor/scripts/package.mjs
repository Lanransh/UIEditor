import { packager } from '@electron/packager';
import { resolve } from 'node:path';

process.env.ELECTRON_MIRROR ??= 'https://npmmirror.com/mirrors/electron/';

const paths = await packager({
  dir: '.',
  out: '../ToolRuntime',
  name: 'UIEditor',
  executableName: 'UIEditor',
  platform: 'win32',
  arch: 'x64',
  asar: true,
  overwrite: true,
  download: { cacheRoot: resolve('../ToolRuntime/Runtime/ElectronDownloadCache') },
  ignore: [/^\/(src|electron|scripts|tests|test-results|docs|\.agents|\.cache|ToolRuntime)(\/|$)/, /^\/(AGENTS\.md|tsconfig\.json|vite\.config\.ts|index\.html|Run\.bat|BuildAndRun\.bat)$/],
});
console.log(paths.join('\n'));
