import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const output = resolve('test-results/roblox-display');
await mkdir(output, { recursive: true });
const server = await createServer({ server: { port: 5198, strictPort: true } });
await server.listen();
const env = { ...process.env, UI_EDITOR_USER_DATA: await mkdtemp(resolve(output, 'runtime-')) };
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ args: ['.'], env });
  const page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5198');
  await page.evaluate(async () => { await import('/tests/fixtures/roblox-display.tsx'); });
  await page.waitForFunction(() => window.displayQA);
  const cases = await page.evaluate(() => window.displayQA.cases.map(c => ({ id: c.id, className: c.className, property: c.property, value: c.value })));
  const results = [];
  for (let i = 0; i < cases.length; i++) {
    await page.evaluate(i => window.displayQA.show(i), i);
    await page.waitForFunction(i => document.querySelector('[data-node-id]')?.getAttribute('data-node-id') === window.displayQA.cases[i].document.root.children[0].id || !window.displayQA.cases[i].document.root.properties.Enabled, i);
    await page.getByLabel('画布缩放').selectOption('1');
    const nodes = await page.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const art = document.querySelector('.ui-artboard'), bounds = art.getBoundingClientRect(), scale = bounds.width / 1280;
      return [...art.querySelectorAll('[data-node-id]')].map(el => {
        const b = el.getBoundingClientRect(), css = getComputedStyle(el);
        const content = el.querySelector(':scope > div'), text = el.querySelector(':scope > div > .preview-text-fill'), image = el.querySelector(':scope > div > .preview-image');
        const summary = x => x && Object.fromEntries(['color', 'fontSize', 'fontFamily', 'whiteSpace', 'textAlign', 'justifyContent', 'backgroundImage', 'backgroundSize', 'backgroundRepeat', 'maskImage', 'backgroundClip', 'webkitTextStrokeWidth', 'webkitTextStrokeColor', 'opacity', 'overflow'].map(k => [k, getComputedStyle(x)[k]]));
        const bars = [...el.querySelectorAll(':scope > div > .preview-scrollbar')].map(bar => Object.fromEntries(['left', 'top', 'width', 'height'].map(k => [k, getComputedStyle(bar)[k]])));
        return { id: el.getAttribute('data-node-id'), className: el.getAttribute('data-class-name'), rect: { x: (b.x - bounds.x) / scale, y: (b.y - bounds.y) / scale, width: b.width / scale, height: b.height / scale }, style: { backgroundColor: css.backgroundColor, backgroundImage: css.backgroundImage, borderRadius: css.borderRadius, outline: css.outline, opacity: css.opacity, transform: css.transform, zIndex: css.zIndex }, content: summary(content), background: summary(el.querySelector(':scope > div > .preview-background')), text: summary(text), textStroke: summary(el.querySelector(':scope > div > .preview-text-stroke')), textValue: text?.textContent, image: summary(image), imageTint: el.querySelector('feColorMatrix')?.getAttribute('values'), bars };
      });
    });
    results.push({ ...cases[i], nodes });
    if (cases[i].property === 'effect:unscaled-text') assert.equal(nodes.find(n => n.className === 'TextLabel').text.fontSize, '40px');
    if (cases[i].className === 'UIStroke' && cases[i].property === 'effect:text') {
      const text = nodes.find(n => n.className === 'TextLabel');
      assert.match(text.style.outline, /none/); assert.equal(text.textStroke.webkitTextStrokeWidth, '6px');
    }
    if (cases[i].property === 'effect:image-Tile') assert.equal(nodes.find(n => n.className === cases[i].className).image.backgroundSize, '100% 100%');
    if (cases[i].property.startsWith('effect:') || cases[i].property === '(default)' || ['UIGradient', 'UIStroke', 'UICorner', 'CanvasGroup', 'ScrollingFrame'].includes(cases[i].className) && ['ColorStart', 'Color', 'CornerRadius', 'Rotation', 'GroupTransparency', 'CanvasPosition'].includes(cases[i].property)) {
      await page.getByTestId('ui-artboard').screenshot({ path: resolve(output, `editor-${cases[i].id}.png`) });
    }
  }
  await writeFile(resolve(output, 'editor-results.json'), JSON.stringify({ errors, cases: results }, null, 2));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ cases: results.length, errors }));
} finally {
  if (app) { await app.evaluate(({ app }) => app.exit()).catch(() => {}); await app.close(); }
  await server.close();
}
