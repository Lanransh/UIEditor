import { test } from 'node:test';
import assert from 'node:assert/strict';
import { robloxStrategy as strategy } from '../src/editor/roblox';
import { allNodes, dim, dim2, findNode, findParent } from '../src/shared/uiDocument';
import { deleteNode, documentCommand, duplicateNode, insertNode, reparentNode, reorderNode } from '../src/editor/commands';
import { CommandHistory } from '../src/history/CommandHistory';

test('所有支持节点可序列化，Scale/Offset 和节点身份往返保持一致', () => {
  let document = strategy.createDocument('在线奖励');
  const frame = strategy.createNode('Frame');
  frame.properties.Position = { x: dim(.5, -120), y: dim(.5, -90) };
  document = insertNode(document, document.root.id, frame, strategy);
  for (const name of Object.keys(strategy.nodes).filter(name => !['ScreenGui', 'Frame', 'UIGridLayout', 'UITextSizeConstraint'].includes(name))) document = insertNode(document, frame.id, strategy.createNode(name), strategy);
  const text = allNodes(document.root).find(node => node.className === 'TextLabel')!;
  document = insertNode(document, text.id, strategy.createNode('UITextSizeConstraint'), strategy);
  assert.deepEqual(strategy.validate(JSON.parse(JSON.stringify(document))), document);
  assert.equal(findNode(document.root, frame.id)?.properties.Position, frame.properties.Position);
});

test('拒绝无效版本、属性、重复 ID、非法根和重复组件', () => {
  const initial = strategy.createDocument();
  const frame = strategy.createNode('Frame');
  const document = insertNode(initial, initial.root.id, frame, strategy);
  const changes = [
    (d: any) => { d.version = 2; },
    (d: any) => { d.root.children[0].id = d.root.id; },
    (d: any) => { d.root.className = 'Frame'; },
    (d: any) => { d.root.children[0].properties.Position.x.scale = '0.5'; },
    (d: any) => { d.root.children[0].properties.Rotation = Infinity; },
    (d: any) => { d.root.children[0].properties.Script = 'bad'; },
    (d: any) => { d.root.children[0].properties.BackgroundTransparency = 2; },
    (d: any) => { d.root.children[0].className = '__proto__'; },
    (d: any) => { d.config = {}; },
  ];
  for (const change of changes) { const copy = structuredClone(document); change(copy); assert.throws(() => strategy.validate(copy)); }
  const corner = strategy.createNode('UICorner');
  const withCorner = insertNode(document, frame.id, corner, strategy);
  assert.throws(() => insertNode(withCorner, frame.id, strategy.createNode('UICorner'), strategy));
  assert.throws(() => insertNode(withCorner, initial.root.id, strategy.createNode('UIPadding'), strategy));
  const withList = insertNode(document, frame.id, strategy.createNode('UIListLayout'), strategy);
  assert.throws(() => insertNode(withList, frame.id, strategy.createNode('UIGridLayout'), strategy));
  assert.throws(() => insertNode(document, frame.id, strategy.createNode('UITextSizeConstraint'), strategy));
  const invalid = structuredClone(withCorner);
  invalid.root.children[0].children.push(strategy.createNode('UICorner'));
  assert.throws(() => strategy.validate(invalid));
});

test('子树复制全部生成新 ID；移动、删除及多步历史可逆，不修改旧文档', () => {
  const initial = strategy.createDocument();
  const a = strategy.createNode('Frame'), b = strategy.createNode('Frame'), text = strategy.createNode('TextLabel');
  a.children.push(text);
  let state = insertNode(insertNode(initial, initial.root.id, a, strategy), initial.root.id, b, strategy);
  const original = JSON.stringify(state), history = new CommandHistory<typeof state>();
  state = history.execute(documentCommand('复制', d => duplicateNode(d, a.id, strategy), strategy), state);
  const copy = state.root.children[2];
  assert.notEqual(copy.id, a.id); assert.notEqual(copy.children[0].id, text.id);
  state = history.execute(documentCommand('移动', d => reparentNode(d, text.id, b.id, strategy), strategy), state);
  assert.equal(findParent(state.root, text.id)?.id, b.id);
  assert.throws(() => reparentNode(state, b.id, text.id, strategy));
  state = history.execute(documentCommand('删除', d => deleteNode(d, a.id), strategy), state);
  assert.equal(findNode(state.root, a.id), undefined);
  state = history.undo(state); state = history.undo(state); state = history.undo(state);
  assert.equal(JSON.stringify(state), original);
  state = history.redo(state); state = history.redo(state); state = history.redo(state);
  assert.equal(findParent(state.root, text.id)?.id, b.id);
  assert.equal(initial.root.children.length, 0);
});

test('顺序与无变化命令，撤销返回已保存内容', () => {
  let document = strategy.createDocument();
  document = insertNode(document, document.root.id, strategy.createNode('Frame'), strategy);
  document = insertNode(document, document.root.id, strategy.createNode('TextLabel'), strategy);
  const saved = JSON.stringify(document), history = new CommandHistory<typeof document>();
  const id = document.root.children[1].id;
  document = history.execute(documentCommand('上移', d => reorderNode(d, id, -1), strategy), document);
  assert.equal(document.root.children[0].id, id);
  const same = history.execute(documentCommand('不变', d => reorderNode(d, id, -1), strategy), document);
  assert.equal(same, document);
  assert.equal(JSON.stringify(history.undo(document)), saved);
});

test('列表布局按 LayoutOrder 排列、跳过隐藏节点，位置 Scale/Offset 和锚点参与普通布局', () => {
  const parent = strategy.createNode('Frame'), a = strategy.createNode('Frame'), b = strategy.createNode('Frame');
  a.properties.Size = dim2(100, 40); a.properties.Position = { x: dim(.5, 10), y: dim(.5, 5) }; a.properties.AnchorPoint = { x: .5, y: .5 };
  parent.children.push(a, b);
  assert.deepEqual(strategy.layout(parent, 400, 200).get(a.id), { x: 160, y: 85, width: 100, height: 40, scale: 1 });
  a.properties.LayoutOrder = 2; b.properties.LayoutOrder = 1; b.properties.Size = dim2(100, 30);
  const layout = strategy.createNode('UIListLayout'); parent.children.push(layout);
  assert.equal(strategy.layout(parent, 400, 200).get(a.id)?.y, 38);
  b.properties.Visible = false;
  assert.equal(strategy.layout(parent, 400, 200).get(a.id)?.y, 0);
});

test('网格换行、间距、UIScale 与尺寸约束', () => {
  const parent = strategy.createNode('Frame');
  const grid = strategy.createNode('UIGridLayout');
  parent.children.push(grid);
  for (let i = 0; i < 3; i++) parent.children.push(strategy.createNode('Frame'));
  const rects = strategy.layout(parent, 220, 300);
  assert.equal(rects.get(parent.children[2].id)?.x, 108);
  assert.equal(rects.get(parent.children[3].id)?.y, 108);
  const child = parent.children[1], limit = strategy.createNode('UISizeConstraint'), scale = strategy.createNode('UIScale');
  limit.properties.MinSize = { x: 120, y: 80 }; limit.properties.MaxSize = { x: 200, y: 200 }; scale.properties.Scale = 2;
  child.children.push(limit, scale);
  assert.equal(strategy.layout(parent, 220, 300).get(child.id)?.width, 120);
  assert.equal(strategy.layout(parent, 220, 300).get(child.id)?.scale, 2);
});
