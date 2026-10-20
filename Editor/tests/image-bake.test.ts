import { test } from 'node:test';
import assert from 'node:assert/strict';
import { robloxStrategy as strategy } from '../src/editor/roblox';
import { bakeSize, convertToBakedImage } from '../src/editor/imageBake';
import { dim2, findNode, type UIDocument } from '../src/shared/uiDocument';
import type { ImageAsset } from '../src/shared/imageAssets';
import { documentCommand } from '../src/editor/commands';
import { CommandHistory } from '../src/history/CommandHistory';

const asset: ImageAsset = { id: 'baked', platform: 'roblox', library: 'project', name: 'Baked', tags: '', usage: 'image', robloxId: '', previewImage: { name: 'Baked.png', dataUrl: 'data:image/png;base64,AA==' } };

test('baking resolves nested, constrained and scrolling layout dimensions independently of zoom', () => {
  const document = strategy.createDocument();
  const scroll = strategy.createNode('ScrollingFrame');
  scroll.properties.Size = dim2(200, 100); scroll.properties.CanvasSize = dim2(800, 600);
  const button = strategy.createNode('TextButton');
  button.properties.Size = { x: { scale: .5, offset: 0 }, y: { scale: .5, offset: 0 } };
  scroll.children.push(button); document.root.children.push(scroll);
  assert.deepEqual(bakeSize(document, button.id, strategy), { width: 400, height: 300 });
  const constraint = strategy.createNode('UIAspectRatioConstraint');
  constraint.properties.AspectRatio = 2; button.children.push(constraint);
  assert.deepEqual(bakeSize(document, button.id, strategy), { width: 400, height: 200 });
  assert.throws(() => bakeSize(document, document.root.id, strategy));
});

test('conversion flattens visuals, retains identity and layout, and restores the original subtree on undo', () => {
  const document = strategy.createDocument();
  const button = strategy.createNode('TextButton'); button.name = 'Claim';
  button.properties.Rotation = 20; button.properties.Position = dim2(123, 45);
  button.children.push(strategy.createNode('UICorner'), strategy.createNode('UIStroke'), strategy.createNode('TextLabel'), strategy.createNode('UIScale'), strategy.createNode('UISizeConstraint'));
  document.root.children.push(button);
  const history = new CommandHistory<UIDocument>();
  let state = history.execute(documentCommand('烘焙为图片', value => convertToBakedImage(value, button.id, 'ImageButton', asset, strategy), strategy), document);
  const baked = findNode(state.root, button.id)!;
  assert.equal(baked.name, 'Claim'); assert.equal(baked.className, 'ImageButton');
  assert.equal(baked.imageAssetId, asset.id); assert.equal('previewImage' in baked, false);
  assert.equal(baked.properties.BackgroundTransparency, 1); assert.equal(baked.properties.ScaleType, 'Stretch');
  assert.equal(baked.properties.ImageColor3, '#ffffff'); assert.equal(baked.properties.ImageTransparency, 0);
  assert.deepEqual(baked.properties.Position, button.properties.Position); assert.equal(baked.properties.Rotation, 20);
  assert.deepEqual(baked.children.map(child => child.className), ['UIScale', 'UISizeConstraint']);
  assert.deepEqual(document.root.children[0], button);
  state = history.undo(state); assert.deepEqual(state, document);
  state = history.redo(state); assert.equal(findNode(state.root, button.id)?.className, 'ImageButton');
  assert.equal(convertToBakedImage(document, button.id, 'ImageLabel', asset, strategy).root.children[0].className, 'ImageLabel');
  assert.throws(() => convertToBakedImage(document, document.root.id, 'ImageLabel', asset, strategy));
});
