import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradientStyle, scrollGeometry } from '../src/editor/appearance';
import { robloxStrategy } from '../src/editor/roblox';
import { displayCases } from './fixtures/roblox-display-cases';

test('渐变底色和透明度独立相乘，透明起点不改变颜色插值', () => {
  const p = { Rotation: 0, ColorStart: '#ffffff', ColorEnd: '#000000', TransparencyStart: 1, TransparencyEnd: 0 };
  const style = gradientStyle(p, '#804020', .7, 240, 140);
  assert.equal(style.backgroundImage, 'linear-gradient(90deg, #804020 0%, #000000 100%)');
  assert.equal(style.maskImage, 'linear-gradient(90deg, #00000000 0%, #000000ff 100%)');
  assert.ok(Math.abs(style.opacity! as number - .3) < .00001);
});

test('双向滚动条跟随归整和边界限制后的 CanvasPosition，预留交叉区域', () => {
  const middle = scrollGeometry(200, 100, 400, 400, 8, 80.5, 60.5);
  assert.equal(middle.x, 80); assert.equal(middle.y, 60);
  const end = scrollGeometry(200, 100, 400, 400, 8, 10000, 10000);
  assert.equal(end.x, 208); assert.equal(end.y, 308);
  assert.ok(Math.abs(end.left + end.thumbWidth - 192) < .001);
  assert.ok(Math.abs(end.top + end.thumbHeight - 92) < .001);
  const tiny = scrollGeometry(200, 100, 400, 10000, 8, 0, 600);
  assert.equal(tiny.thumbHeight, 16);
  const cross = scrollGeometry(200, 100, 200, 400, 8, 0, 80);
  assert.equal(cross.horizontal, true); assert.equal(cross.vertical, true);
});

test('网格的约束跨格、缩放居中和排序与 Studio 原生测量保持一致', () => {
  const expected: Record<string, number[]> = {
    'plain-scale': [-50, 58, 200, 200], 'min-only': [44, 118, 120, 80],
    'small-scale': [74, 138, 60, 40], 'big-scale': [-16, 78, 240, 160],
    'min-gap': [51.5, 159.5, 105, 105], 'min-208': [0, 108, 208, 208],
    max: [10, 128, 80, 60], first: [14, -10, 180, 120],
    'wide-min': [44, 158, 120, 0], 'high-min': [50, 152, 0, 120],
    'span-210': [53, 161, 210, 210], mixed: [44, 158, 120, 0], aspect: [0, 133, 100, 50],
  };
  for (const [name, values] of Object.entries(expected)) {
    const c = displayCases.find(c => c.property === `effect:grid-${name}`)!;
    const owner = c.document.root.children[0].children[0], child = owner.children.find(n => n.name === 'C')!;
    const rect = robloxStrategy.layout(owner, 240, 140).get(child.id)!;
    assert.deepEqual([rect.x, rect.y, rect.width * rect.scale, rect.height * rect.scale], values, name);
  }
});
