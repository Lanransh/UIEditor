import { _electron as electron } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// Flat regions only: this deliberately excludes font rasterization and geometry edges.
const samples = {
  239: [[80, 180], [150, 180], [220, 180], [300, 180]],
  303: [[80, 180], [150, 180], [220, 180], [300, 180]],
  336: [[80, 180], [150, 180], [220, 180], [300, 180]],
  315: [[80, 80], [130, 80], [260, 80]],
  314: [[80, 80], [110, 80], [240, 145]],
  337: [[80, 80], [130, 80], [200, 80], [260, 80]],
  338: [[266, 84], [150, 156]],
  339: [[244, 156], [266, 84]],
  340: [[266, 110], [120, 156], [180, 156]],
  341: [[266, 140], [220, 156]],
  342: [[266, 72]],
};
const output = resolve('test-results/roblox-display');
const env = { ...process.env, UI_EDITOR_BACKGROUND: '1', UI_EDITOR_USER_DATA: resolve(output, 'pixels-runtime') }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
try {
  const page = await app.firstWindow(), results = [];
  for (const [id, points] of Object.entries(samples)) {
    const editor = (await readFile(resolve(output, `editor-case-${id}.png`))).toString('base64');
    const studio = (await readFile(resolve(output, `fix-studio-case-${id}.png`))).toString('base64');
    const pixels = await page.evaluate(async ({ editor, studio, points }) => {
      async function sample(bytes) {
        const image = new Image(); image.src = 'data:image/png;base64,' + bytes; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
        return points.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3));
      }
      return { editor: await sample(editor), studio: await sample(studio) };
    }, { editor, studio, points });
    const differences = points.map((point, i) => ({ point, editor: pixels.editor[i], studio: pixels.studio[i], delta: Math.max(...pixels.editor[i].map((v, k) => Math.abs(v - pixels.studio[i][k]))) }));
    results.push({ case: id, differences });
  }
  await writeFile(resolve(output, 'pixel-comparison.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ cases: results.length, samples: results.reduce((n, r) => n + r.differences.length, 0), maxDelta: Math.max(...results.flatMap(r => r.differences.map(p => p.delta))), failures: results.flatMap(r => r.differences.filter(p => p.delta > 8).map(p => ({ case: r.case, ...p }))) }, null, 2));
  assert.ok(results.every(r => r.differences.every(p => p.delta <= 8)), 'Flat-color samples differ by more than 8/255 (allows Studio JPEG compression).');
  const overview = [];
  for (const [id, title] of [[303, 'Gradient + transparency'], [305, 'Text stroke (font differences retained)'], [315, 'Image tint + Fit'], [338, 'Horizontal + vertical scrollbars']]) {
    const images = await Promise.all(['fix-studio', 'editor'].map(async prefix => (await readFile(resolve(output, `${prefix}-case-${id}.png`))).toString('base64')));
    overview.push({ title, images });
  }
  await page.setViewportSize({ width: 860, height: 1160 });
  await page.setContent(`<style>body{margin:20px;font:16px Arial;background:#ddd}header,section{display:grid;grid-template-columns:400px 400px;gap:20px}h3{margin:16px 0 8px}figure{margin:0;width:400px;height:240px;overflow:hidden;position:relative}img{position:absolute;left:-30px;top:-30px;max-width:none}</style><header><b>Roblox Studio</b><b>UI Editor</b></header>${overview.map(row => `<h3>${row.title}</h3><section>${row.images.map(bytes => `<figure><img src="data:image/png;base64,${bytes}"></figure>`).join('')}</section>`).join('')}`);
  await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
  await page.screenshot({ path: resolve(output, 'display-fixes.png'), fullPage: true });
} finally { await app.evaluate(({ app }) => app.exit()).catch(() => {}); await app.close(); }
