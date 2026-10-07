import { spawnSync } from 'node:child_process';
import { mkdir, copyFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = join(root, '.cache', 'native-build');
let cmake = process.env.UI_EDITOR_CMAKE || 'cmake';
if (!process.env.UI_EDITOR_CMAKE && process.platform === 'win32') {
  const probe = spawnSync(cmake, ['--version'], { windowsHide: true });
  if (probe.error?.code === 'ENOENT') {
    const installed = join(process.env.ProgramFiles || 'C:\\Program Files', 'CMake', 'bin', 'cmake.exe');
    try { await access(installed); cmake = installed; } catch {
      throw new Error('CMake was not found. Install CMake 3.20+ or set UI_EDITOR_CMAKE to the full path of cmake.exe.');
    }
  }
}
const args = ['-S', join(root, 'native'), '-B', output, '-DCMAKE_BUILD_TYPE=Release'];
for (const [name, variable] of [['luau', 'UI_EDITOR_LUAU_SOURCE'], ['json', 'UI_EDITOR_JSON_SOURCE']]) {
  if (process.env[variable]) args.push(`-DFETCHCONTENT_SOURCE_DIR_${name.toUpperCase()}=${resolve(process.env[variable])}`);
}
args.push(...process.argv.slice(2));
function run(command, arguments_) {
  const result = spawnSync(command, arguments_, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
run(cmake, args);
run(cmake, ['--build', output, '--config', 'Release', '--target', 'ui-luau', '--parallel', '4']);
let executable = join(output, 'Release', 'ui-luau.exe');
try { await access(executable); } catch { executable = join(output, 'ui-luau.exe'); }
await mkdir(join(root, 'native-bin'), { recursive: true });
await copyFile(executable, join(root, 'native-bin', 'ui-luau.exe'));
await copyFile(join(root, 'native', 'bootstrap.luau'), join(root, 'native-bin', 'bootstrap.luau'));
await copyFile(join(root, 'native', 'editor.luau'), join(root, 'native-bin', 'editor.luau'));
for (const [name, variable, license] of [['luau', 'UI_EDITOR_LUAU_SOURCE', 'LICENSE.txt'], ['json', 'UI_EDITOR_JSON_SOURCE', 'LICENSE.MIT']]) {
  const source = process.env[variable] ? resolve(process.env[variable]) : join(output, '_deps', `${name}-src`);
  await copyFile(join(source, license), join(root, 'native-bin', `${name}-LICENSE.txt`));
}
