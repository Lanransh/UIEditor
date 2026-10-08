import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const output = resolve('test-results/corner-clipping');
await mkdir(output, { recursive: true });
const server = await createServer({ server: { port: 5198, strictPort: true } });
await server.listen();
const env = { ...process.env, UI_EDITOR_BACKGROUND: '1', UI_EDITOR_USER_DATA: await mkdtemp(resolve(output, 'runtime-')) };
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ args: ['.'], env });
  const page = await app.firstWindow(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5198');
  await page.evaluate(async () => { await import('/tests/fixtures/roblox-display.tsx'); });
  await page.waitForFunction(() => window.displayQA);
  for (const className of ['Frame', 'ImageButton']) for (const clips of [true, false]) {
    const id = await page.evaluate(async ({ className, clips }) => {
      const { robloxStrategy: strategy } = await import('/src/editor/roblox.ts');
      const { dim2, dim } = await import('/src/shared/uiDocument.ts');
      const document = strategy.createDocument('CornerClipping'), parent = strategy.createNode(className);
      Object.assign(parent.properties, { Position: dim2(100, 100), Size: dim2(100, 60), BackgroundColor3: '#00ff00', ClipsDescendants: clips });
      const corner = strategy.createNode('UICorner'); corner.properties.CornerRadius = dim(0, 20);
      const edge = strategy.createNode('Frame');
      Object.assign(edge.properties, { Position: dim2(0, 50), Size: dim2(110, 10), BackgroundColor3: '#ff0000', ZIndex: 2 });
      if (className === 'ImageButton') {
        parent.previewImage = { name: 'blue.svg', dataUrl: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><rect width="100" height="60" fill="blue"/></svg>') };
        parent.properties.ScaleType = 'Stretch';
      }
      parent.children.push(corner, edge); document.root.children.push(parent);
      const index = window.displayQA.cases.length;
      window.displayQA.cases.push({ document }); window.displayQA.show(index);
      return parent.id;
    }, { className, clips });
    const node = page.locator(`[data-node-id="${id}"]`);
    await node.waitFor(); await page.getByLabel('画布缩放').selectOption('1');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const bounds = await node.boundingBox();
    const screenshot = await page.screenshot({ path: resolve(output, `${className}-${clips}.png`), clip: { x: bounds.x, y: bounds.y, width: 112, height: 60 } });
    const samples = await app.evaluate(({ nativeImage }, bytes) => {
      const image = nativeImage.createFromBuffer(Buffer.from(bytes));
      const { width } = image.getSize(), bitmap = image.toBitmap();
      const rgb = (x, y) => { const ratio = width / 112; const i = (Math.floor((y + .5) * ratio) * width + Math.floor((x + .5) * ratio)) * 4; return [bitmap[i + 2], bitmap[i + 1], bitmap[i]]; };
      return { corner: rgb(1, 55), outside: rgb(105, 55), top: rgb(1, 1), middle: rgb(50, 20) };
    }, [...screenshot]);
    assert.deepEqual(samples.corner, [255, 0, 0], `${className}: parent corner must not clip descendants`);
    if (clips) assert.notDeepEqual(samples.outside, [255, 0, 0], 'rectangle must clip overflow');
    else assert.deepEqual(samples.outside, [255, 0, 0], 'overflow must remain visible');
    const fill = className === 'ImageButton' ? [0, 0, 255] : [0, 255, 0];
    assert.deepEqual(samples.middle, fill, 'parent surface must retain its fill');
    assert.notDeepEqual(samples.top, fill, 'parent surface must retain rounded corners');
  }
  assert.deepEqual(errors, []);
  console.log('PASS: rounded Frame/ImageButton surfaces, rectangular descendant clipping and visible overflow');
} finally {
  if (app) { await app.evaluate(({ app }) => app.exit()).catch(() => {}); await app.close(); }
  await server.close();
}
