import { test } from 'node:test';
import assert from 'node:assert/strict';
import { robloxStrategy } from '../src/editor/roblox';
import { dim2 } from '../src/shared/uiDocument';
import { stylePreviewBounds } from '../src/editor/stylePreview';

test('小组件聚焦实际尺寸，忽略不可见节点，保持文档不变', () => {
  const document = robloxStrategy.createDocument();
  const button = robloxStrategy.createNode('TextButton');
  button.properties.Position = dim2(614, 334);
  button.properties.Size = dim2(52, 52);
  const hidden = robloxStrategy.createNode('Frame');
  hidden.properties.Visible = false;
  document.root.children.push(button, hidden);
  const before = structuredClone(document);
  assert.deepEqual(stylePreviewBounds(document), { x: 598, y: 318, width: 84, height: 84 });
  assert.deepEqual(document, before);
  document.root.properties.Enabled = false;
  assert.deepEqual(stylePreviewBounds(document), { x: 0, y: 0, width: 1280, height: 720 });
});

test('多个组件合并范围，考虑 Scale、锚点和旋转', () => {
  const document = robloxStrategy.createDocument();
  const panel = robloxStrategy.createNode('Frame');
  panel.properties.Position = dim2(400, 300);
  panel.properties.Size = dim2(200, 100);
  panel.properties.AnchorPoint = { x: .5, y: .5 };
  panel.properties.Rotation = 90;
  const scale = robloxStrategy.createNode('UIScale');
  scale.properties.Scale = 2;
  panel.children.push(scale);
  document.root.children.push(panel);
  const bounds = stylePreviewBounds(document);
  assert.equal(bounds.x, 284);
  assert.equal(bounds.y, 84);
  assert.ok(Math.abs(bounds.width - 232) < .001);
  assert.equal(bounds.height, 432);
  const other = robloxStrategy.createNode('Frame');
  other.properties.Position = dim2(0, 0);
  other.properties.Size = dim2(20, 20);
  document.root.children.push(other);
  assert.equal(stylePreviewBounds(document).x, -16);
  assert.equal(stylePreviewBounds(document).y, -16);
});
