import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ignoredPackageContent } from '../scripts/package-content.mjs';

test('打包仅保留 manifest 和已打包的前端、主进程及 preload', () => {
  for (const path of ['', '/package.json', '/dist', '/dist/index.html', '/dist/assets/editor.worker.js', '/dist-electron', '/dist-electron/main.cjs', '/dist-electron/preload.cjs']) {
    assert.equal(ignoredPackageContent.test(path), false, path);
  }
  for (const path of ['/node_modules', '/node_modules/monaco-editor', '/node_modules/lucide-react', '/src', '/public', '/electron', '/scripts', '/tests', '/test-results', '/.cache', '/native-bin', '/mcp-dist', '/TemplateStyles', '/package-lock.json', '/dist-old', '/dist-electron-old', '/package.json.bak']) {
    assert.equal(ignoredPackageContent.test(path), true, path);
  }
});
