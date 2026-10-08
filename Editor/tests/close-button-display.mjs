import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const output = resolve('test-results/close-button-display');
await mkdir(output, { recursive: true });
const server = await createServer({ server: { port: 5198, strictPort: true } });
await server.listen();
const env = { ...process.env, UI_EDITOR_BACKGROUND: '1', UI_EDITOR_USER_DATA: await mkdtemp(resolve(output, 'runtime-')) };
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ args: ['.'], env });
  const page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  await page.goto('http://127.0.0.1:5198');
  await page.evaluate(async () => { await import('/tests/fixtures/roblox-display.tsx'); });
  await page.waitForFunction(() => window.displayQA);
  for (const name of ['CloseButton', 'SmallWindow', 'MediumWindow', 'LargeWindow']) {
    const document = JSON.parse(await readFile(resolve('../TemplateStyles/Roblox/多彩棋格风格/template-references', `${name}.rbxui.json`), 'utf8'));
    const find = (node, name) => node.name === name ? node : node.children.map(child => find(child, name)).find(Boolean);
    const surface = find(document.root, 'CloseSurfaceImg');
    const button = find(surface, 'CloseBtn');
    assert.equal(button.className, 'TextButton');
    assert.equal(button.properties.Text, '×');
    await page.evaluate(document => {
      const index = window.displayQA.cases.length;
      window.displayQA.cases.push({ document });
      window.displayQA.show(index);
    }, document);
    const locator = page.locator(`[data-node-id="${surface.id}"]`);
    await locator.waitFor();
    for (const scale of ['1', '0.5']) {
      await page.getByLabel('画布缩放').selectOption(scale);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const screenshot = await locator.screenshot({ path: resolve(output, `${name}-${scale}.png`) });
      const bounds = await app.evaluate(({ nativeImage }, bytes) => {
        const image = nativeImage.createFromBuffer(Buffer.from(bytes));
        const { width, height } = image.getSize();
        const pixels = image.toBitmap();
        let left = width, right = -1, top = height, bottom = -1;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            if (pixels[i] > 220 && pixels[i + 1] > 220 && pixels[i + 2] > 220 && pixels[i + 3] > 220) {
              left = Math.min(left, x); right = Math.max(right, x);
              top = Math.min(top, y); bottom = Math.max(bottom, y);
            }
          }
        }
        return { width, height, left, right, top, bottom };
      }, [...screenshot]);
      assert.ok(bounds.right >= bounds.left, `${name}: 应显示白色关闭字符`);
      const dx = (bounds.left + bounds.right + 1 - bounds.width) / 2;
      const dy = (bounds.top + bounds.bottom + 1 - bounds.height) / 2;
      console.log(`${name} zoom=${scale}: glyph offset=(${dx}, ${dy})`);
      assert.ok(Math.abs(dx) <= 1 && Math.abs(dy) <= 1, `${name} zoom=${scale}: 关闭字符应视觉居中，实际偏移 (${dx}, ${dy})`);
    }
  }
} finally {
  if (app) { await app.evaluate(({ app }) => app.exit()).catch(() => {}); await app.close(); }
  await server.close();
}
