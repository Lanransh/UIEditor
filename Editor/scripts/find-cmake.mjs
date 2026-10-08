import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export function findCMake(env = process.env, platform = process.platform, spawn = spawnSync) {
  const options = { encoding: 'utf8', windowsHide: true, timeout: 10000 };
  const checked = [];
  function supported(command) {
    const result = spawn(command, ['--version'], options);
    const version = result.stdout?.match(/cmake version (\d+)\.(\d+)\.(\d+)/);
    checked.push(`${command}: ${version?.[0] || result.error?.message || 'unavailable'}`);
    return result.status === 0 && version && (Number(version[1]) > 3 || (Number(version[1]) === 3 && Number(version[2]) >= 20));
  }
  function missing() {
    throw new Error(`CMake 3.20+ is required. Install a supported version or set UI_EDITOR_CMAKE to its full path.\n${checked.join('\n')}`);
  }
  if (env.UI_EDITOR_CMAKE) {
    if (supported(env.UI_EDITOR_CMAKE)) return env.UI_EDITOR_CMAKE;
    missing();
  }
  if (supported('cmake')) return 'cmake';
  if (platform === 'win32') {
    const installed = join(env.ProgramFiles || 'C:\\Program Files', 'CMake', 'bin', 'cmake.exe');
    if (supported(installed)) return installed;
    const vswhere = join(env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
    const result = spawn(vswhere, ['-all', '-sort', '-products', '*', '-find', 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe'], options);
    if (result.status === 0) {
      for (const candidate of result.stdout.trim().split(/\r?\n/).filter(Boolean)) {
        if (supported(candidate)) return candidate;
      }
    }
  }
  missing();
}
