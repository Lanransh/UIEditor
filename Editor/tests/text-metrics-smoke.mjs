import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const output = resolve('test-results/text-metrics');
await mkdir(output, { recursive: true });
const server = await createServer({ server: { port: 0 } });
await server.listen();
const address = server.httpServer.address();
const env = { ...process.env, UI_EDITOR_BACKGROUND: '1', UI_EDITOR_USER_DATA: await mkdtemp(resolve(output, 'runtime-')) };
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ args: ['.'], env });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => { await import('/tests/fixtures/text-metrics.tsx'); });
  await page.locator('[data-node-id="placeholder"] .preview-text-fill').waitFor();
  const fonts = await page.evaluate(async () => {
    const fonts = [['Roblox Montserrat', 400], ['Roblox Montserrat', 700], ['Roblox Source Sans Pro', 400], ['Roblox Arimo', 400]];
    return Promise.all(fonts.map(async ([family, weight]) => {
      const faces = await document.fonts.load(`${weight} 20px "${family}"`, 'Rebirth');
      return { family, weight, loaded: faces.length, statuses: faces.map(face => face.status) };
    }));
  });
  for (const font of fonts) {
    assert.ok(font.loaded > 0, `${font.family} must load a bundled font face`);
    assert.ok(font.statuses.every(status => status === 'loaded'));
  }
  await page.getByLabel('画布缩放').selectOption('1');
  await page.evaluate(async () => { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  const metrics = await page.evaluate(() => {
    const art = document.querySelector('.ui-artboard');
    const zoom = art.getBoundingClientRect().width / 1280;
    return Object.fromEntries([...art.querySelectorAll('[data-node-id]')].flatMap(node => {
      const fill = node.querySelector(':scope > div > .preview-text-fill');
      if (!fill) return [];
      const style = getComputedStyle(fill), range = document.createRange();
      range.selectNodeContents(fill);
      const rect = range.getBoundingClientRect();
      return [[node.getAttribute('data-node-id'), { text: fill.textContent, size: parseFloat(style.fontSize), family: style.fontFamily, weight: style.fontWeight, width: rect.width / zoom, height: rect.height / zoom }]];
    }));
  });
  // Roblox TextService:GetTextSize observations from Studio, with no UIScale.
  // Native rounds glyph advances; allow up to 3 px over each complete string.
  const native = { rebirth20: 67.2, rebirth19: 62.4, rebirth23: 73.6, title19: 72, multiplier23: 22.4, sourceSans20: 50.4, arial20: 60, gotham20: 64, rebirth40: 132, rebirth100: 324 };
  await writeFile(resolve(output, 'metrics.json'), JSON.stringify({ fonts, metrics, native, errors }, null, 2));
  await page.getByTestId('ui-artboard').screenshot({ path: resolve(output, 'editor.png') });
  for (const [id, width] of Object.entries(native)) {
    // At size 40, allow a cumulative half pixel per glyph in the 7-letter word.
    const tolerance = id === 'rebirth40' ? 3.5 : 3;
    assert.ok(Math.abs(metrics[id].width - width) <= tolerance, `${id}: editor ${metrics[id].width}px vs Roblox ${width}px`);
  }
  assert.match(metrics.rebirth20.family, /Roblox Montserrat/);
  assert.equal(metrics.rebirth20.weight, '700');
  assert.equal(metrics.rebirth20.size, 20);
  assert.equal(metrics.rebirth19.size, 19);
  assert.equal(metrics.rebirth23.size, 23);
  assert.equal(metrics.fractional.size, 23, 'Roblox floors fractional TextSize');
  assert.equal(metrics.fractional.width, metrics.rebirth23.width);
  assert.equal(metrics.unscaledConstraint.size, 20, 'UITextSizeConstraint only affects TextScaled');
  assert.equal(metrics.unscaledConstraint.width, metrics.rebirth20.width);
  assert.ok(metrics.multiline.height > metrics.rebirth20.height * 1.5, 'explicit newline must produce multiple lines');
  assert.ok(metrics.narrow.size > metrics.wide.size, 'TextScaled must measure glyph widths, not character count');
  assert.ok(metrics.wide.width <= 141, 'scaled wide glyphs must fit the 140 px label');
  assert.equal(metrics.maximum.size, 18);
  assert.equal(metrics.minimum.size, 16);
  assert.equal(metrics.placeholder.text, 'WWWWWW');
  assert.equal(metrics.placeholder.size, metrics.wide.size, 'TextBox must scale the displayed placeholder');
  assert.match(metrics.gotham.family, /Roblox Montserrat/);
  assert.match(metrics.sourceSans.family, /Roblox Source Sans Pro/);
  assert.match(metrics.arial.family, /Roblox Arimo/);
  assert.deepEqual(errors, []);
  console.log('PASS: bundled font faces, native Roblox text widths, glyph-aware TextScaled, constraints and placeholders.');
  console.log(`Screenshot: ${resolve(output, 'editor.png')}`);
} finally {
  if (app) { await app.evaluate(({ app }) => app.exit()).catch(() => {}); await app.close(); }
  await server.close();
}
