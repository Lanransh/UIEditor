import { readFile, writeFile } from 'node:fs/promises';
const path = 'test-results/roblox-display/';
const editor = JSON.parse(await readFile(path + 'editor-results.json', 'utf8'));
const studio = JSON.parse(await readFile(path + 'studio-results.json', 'utf8'));
const failures = [], inert = [];
for (const c of editor.cases) {
  const native = studio.cases.find(n => n.id === c.id);
  if (!native) throw new Error('Missing native case ' + c.id);
  const host = native.nodes.find(n => n.id === `${c.id}:1`);
  if (c.property !== 'Rotation') {
    for (const n of c.nodes) {
      const actual = native.nodes.find(v => v.id === n.id);
      if (!actual) throw new Error('Missing native node ' + n.id);
      const rect = { ...actual.rect, x: actual.rect.x - host.rect.x + 30, y: actual.rect.y - host.rect.y + 30 };
      const differences = Object.keys(n.rect).filter(k => Math.abs(n.rect[k] - rect[k]) > 1.1);
      if (differences.length) failures.push({ case: c.id, className: c.className, property: c.property, value: c.value, node: n.className, editor: n.rect, studio: rect, differences });
    }
  }
  const base = editor.cases.find(b => b.className === c.className && b.property === '(default)');
  const normalized = v => JSON.stringify(v.nodes.map(({ id, ...rest }) => rest));
  if (c.property !== '(default)' && normalized(c) === normalized(base)) inert.push({ case: c.id, className: c.className, property: c.property, value: c.value });
}
const summary = { cases: editor.cases.length, errors: editor.errors, geometryDifferences: failures.length, differenceProperties: [...new Set(failures.map(f => f.className + '.' + f.property))], unchangedInThisFixture: [...new Set(inert.map(f => f.className + '.' + f.property))] };
await writeFile(path + 'comparison.json', JSON.stringify({ summary, failures, inert }, null, 2));
console.log(JSON.stringify(summary, null, 2));
