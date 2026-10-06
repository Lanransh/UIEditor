import { robloxStrategy as strategy } from '../../src/editor/roblox';
import { allNodes, dim, dim2, type UIDocument, type UINode } from '../../src/shared/uiDocument';
import type { PropertyDefinition } from '../../src/editor/strategy';

function values(key: string, p: PropertyDefinition): unknown[] {
  switch (p.kind) {
    case 'boolean': return [!p.value];
    case 'enum': return p.choices!;
    case 'color': return ['#d84c72'];
    case 'string': return [key === 'Image' ? 'rbxasset://textures/ui/GuiImagePlaceholder.png' : 'Display test\nSecond line'];
    case 'number': return [...new Set([p.min, p.max, key.includes('Transparency') ? .5 : key === 'Rotation' ? 35 : key === 'Scale' ? 1.5 : 3])].filter((v): v is number => v !== undefined && v >= (p.min ?? -Infinity) && v <= (p.max ?? Infinity));
    case 'vector': return [{ x: .5, y: .5 }, { x: Math.min(p.max ?? 80, 80), y: Math.min(p.max ?? 60, 60) }];
    case 'udim': return [dim(0, 16), dim(.15, 4)];
    case 'udim2': return [dim2(120, 70), { x: dim(.5, 10), y: dim(.4, 8) }];
  }
}

export interface DisplayCase { id: string; className: string; property: string; value: unknown; document: UIDocument; targetId: string }
export const displayCases: DisplayCase[] = [];
for (const [className, definition] of Object.entries(strategy.nodes)) {
  const variants = [{ property: '(default)', value: null }, ...Object.entries(definition.properties).flatMap(([property, p]) => values(property, p).map(value => ({ property, value })))];
  for (const { property, value } of variants) {
    const document = strategy.createDocument(), host = strategy.createNode('Frame');
    host.name = 'Host'; host.properties.Size = dim2(400, 240); host.properties.Position = dim2(30, 30); host.properties.BackgroundColor3 = '#c4ced8';
    document.root.children.push(host);
    let target: UINode;
    if (definition.category === 'root') target = document.root;
    else if (definition.category === 'component') {
      const owner = strategy.createNode(className === 'UITextSizeConstraint' ? 'TextLabel' : 'Frame');
      owner.properties.Position = dim2(40, 30); owner.properties.Size = dim2(240, 140);
      if (className === 'UITextSizeConstraint') { owner.properties.TextScaled = true; owner.properties.Text = 'Scale constrained text'; }
      target = strategy.createNode(className); owner.children.push(target); host.children.push(owner);
      for (let i = 0; i < 3; i++) {
        const child = strategy.createNode('Frame'); child.name = ['C', 'A', 'B'][i];
        child.properties.Size = dim2(60, 30); child.properties.Position = dim2(20 + i * 50, 15 + i * 30);
        child.properties.LayoutOrder = 2 - i; child.properties.BackgroundColor3 = ['#ed6a5a', '#57b894', '#5098db'][i];
        owner.children.push(child);
      }
    } else {
      target = strategy.createNode(className); target.properties.Position = dim2(40, 30); host.children.push(target);
      const child = strategy.createNode('Frame'); child.properties.Position = dim2(150, 70); child.properties.Size = dim2(80, 50); child.properties.BackgroundColor3 = '#ed6a5a'; target.children.push(child);
    }
    target.name = 'Target';
    if (property !== '(default)') target.properties[property] = structuredClone(value) as never;
    // Keep the opposite bound valid when checking constraint endpoints.
    if (className === 'UITextSizeConstraint' && property === 'MinTextSize') target.properties.MaxTextSize = Math.max(value as number, target.properties.MaxTextSize as number);
    if (className === 'UITextSizeConstraint' && property === 'MaxTextSize') target.properties.MinTextSize = Math.min(value as number, target.properties.MinTextSize as number);
    allNodes(document.root).forEach((node, i) => { node.id = `case-${displayCases.length}:${i}`; });
    strategy.validate(document);
    displayCases.push({ id: `case-${displayCases.length}`, className, property, value, document, targetId: target.id });
  }
}

function effect(className: string, name: string, edit: (document: UIDocument) => void) {
  const base = displayCases.find(c => c.className === className && c.property === '(default)')!;
  const document = structuredClone(base.document);
  edit(document);
  const target = allNodes(document.root).find(n => n.name === 'Target')!;
  allNodes(document.root).forEach((node, i) => { node.id = `case-${displayCases.length}:${i}`; });
  strategy.validate(document);
  displayCases.push({ id: `case-${displayCases.length}`, className, property: `effect:${name}`, value: null, document, targetId: target.id });
}
// Interactions which a property-only matrix cannot expose.
effect('UIGradient', 'transparent-colored-background', d => {
  const owner = d.root.children[0].children[0];
  owner.properties.BackgroundColor3 = '#ed6a5a'; owner.properties.BackgroundTransparency = .7;
});
effect('UIGradient', 'text', d => {
  const owner = d.root.children[0].children[0], text = strategy.createNode('TextLabel');
  owner.className = 'TextLabel'; owner.properties = { ...text.properties, ...owner.properties, Text: 'Gradient text', BackgroundTransparency: 1 }; owner.children = owner.children.filter(n => n.className === 'UIGradient');
});
effect('UIStroke', 'text', d => {
  const owner = d.root.children[0].children[0], text = strategy.createNode('TextLabel');
  owner.className = 'TextLabel'; owner.properties = { ...text.properties, ...owner.properties, Text: 'Outlined text', BackgroundTransparency: 1 }; owner.children = owner.children.filter(n => n.className === 'UIStroke'); owner.children[0].properties.Thickness = 3;
});
effect('UIPadding', 'scaled-child', d => {
  const owner = d.root.children[0].children[0];
  owner.children[0].properties.PaddingLeft = dim(.1, 10); owner.children[0].properties.PaddingRight = dim(.1, 10);
  owner.children[1].properties.Position = { x: dim(.5, 0), y: dim(.5, 0) }; owner.children[1].properties.Size = { x: dim(.5, 0), y: dim(.5, 0) };
});
effect('UITextSizeConstraint', 'unscaled-text', d => {
  const owner = d.root.children[0].children[0]; owner.properties.TextScaled = false; owner.properties.TextSize = 40; owner.children[0].properties.MaxTextSize = 12;
});
effect('TextBox', 'placeholder', d => { d.root.children[0].children[0].properties.Text = ''; });
effect('UIListLayout', 'scaled-padding', d => { d.root.children[0].children[0].children[0].properties.Padding = dim(.1, 0); });
effect('UIGridLayout', 'constrained-scaled-cell', d => {
  const owner = d.root.children[0].children[0], child = owner.children[1];
  const size = strategy.createNode('UISizeConstraint'); size.properties.MinSize = { x: 120, y: 80 };
  const scale = strategy.createNode('UIScale'); scale.properties.Scale = 1.5; child.children.push(size, scale);
});

// Same 256px placeholder as rbxasset://textures/ui/GuiImagePlaceholder.png.
const placeholder = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAAAAAB5Gfe6AAAD1klEQVR42u3d61biMBSGYe//2jaWo6DIsUgpVtvmCmZN4rBFSxaOrlWbvN/PAD/6kOwcqvTGRJ4bAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIA4AdLppLVM0/YBNtJqNq0D9KXV9FsHkJYDwK8A6CUtpPeLAKamhUwBAAAAAAAAAAAAAAAAAAAA+LUAZZauN0/HSAHq7URckodjhAC7gYjm/iUygHou50nyqADqiXzKU0wA9/I5vTwegI249BfZMU9n4pKUsQCUidisa2NTjMVmGQvA0nX5TEvC1LW8RgLgOkBqNNXQdYk4AHLbPDprO9i2cRwAa+0AGtcFanM5+fYYCMDcNn8Y74+2sXE9qG9YhwHgpr3GbpGbS9np61ECVH0tElEOgZW4pJEWwZeeuCRVnNOg7h2WsS2ElMyl9xLjUngkmlmEm6FUbFZik0e3Ha6c19zcafGI6kBkYV++LU0hNmlkR2JF71QgH7WnRHIoqtcyrLV4LKI6Fj+Izf598ShCuzEyP5rG6BLxzrg4tWlEt8a25995JjZZqDdH89WualoyPH6sCIECpCIyUYGmul+IzTZIgEJr/OXLXShJUAB6UtIrjK/Dl7c6KAIDOIiLfmAvNoemnUERHsBQ5PyCa9cy80yMIQGk4qJdfqNDomlpFBhAlcgp2/ejfXmhVgzrsACWorkt9fA0qS6dEK7DAdA930q3O89ik3o2yOEAaLfWpa/bKYx8RyQBAeSnwjZ8+9DedwC2OzGFAjA6TW3ZG8VAp0DP+wMB0G9U14N6CO7rMYEA6JjWcqhToLdmhAGwPKvqC/mXfmWM/2bZJgQAndf1DMBlZzSeqbCDAP7unIrL+JphEwBA/umYayw2+VWFs9sAerkToznalofrps5uA2iHf/749xDD8srFU8cBqn7TWH6ar16vrh2dBtAp0Bf/VNhpgFe9iK9GD0i7CqD3iQe18cc/FXYWwF/IvrCH6C7ARGyG/xuxuesswF5+JllXAe7lZzLvKsCsBYAgh8ChawAqMB18P7OMf54GAAAAAAAAAAAAAAAAAAAA4C8AP6zMT2sDIMLP6/OABR6xwUNWAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACiyx86V8OKVEbklQAAAABJRU5ErkJggg==';
for (const className of ['ImageLabel', 'ImageButton']) {
  effect(className, 'image-stud-tile', d => {
    const image = d.root.children[0].children[0]; image.properties.ScaleType = 'Tile'; image.properties.TileSize = dim2(27, 27);
    image.previewImage = { name: 'GuiImagePlaceholder.png', dataUrl: placeholder }; image.children = [];
  });
  for (const scaleType of ['Fit', 'Stretch', 'Crop', 'Tile']) effect(className, `image-${scaleType}`, d => {
    const image = d.root.children[0].children[0]; image.properties.Image = 'rbxasset://textures/ui/GuiImagePlaceholder.png'; image.properties.ScaleType = scaleType;
    image.previewImage = { name: 'GuiImagePlaceholder.png', dataUrl: placeholder }; image.children = [];
  });
  effect(className, 'image-tint', d => {
    const image = d.root.children[0].children[0]; image.properties.Image = 'rbxasset://textures/ui/GuiImagePlaceholder.png'; image.properties.ImageColor3 = '#d84c72';
    image.previewImage = { name: 'GuiImagePlaceholder.png', dataUrl: placeholder }; image.children = [];
  });
  effect(className, 'image-transparency', d => {
    const image = d.root.children[0].children[0]; image.properties.Image = 'rbxasset://textures/ui/GuiImagePlaceholder.png'; image.properties.ImageTransparency = .5;
    image.previewImage = { name: 'GuiImagePlaceholder.png', dataUrl: placeholder }; image.children = [];
  });
}

for (const [name, scale, minX, minY, maxX, maxY, first] of [
  ['plain-scale', 2, 0, 0, 10000, 10000, false], ['min-only', 1, 120, 80, 10000, 10000, false],
  ['small-scale', .5, 120, 80, 10000, 10000, false], ['big-scale', 2, 120, 80, 10000, 10000, false],
  ['min-gap', 1, 105, 105, 10000, 10000, false], ['min-208', 1, 208, 208, 10000, 10000, false],
  ['max', 2, 0, 0, 40, 30, false], ['first', 1.5, 120, 80, 10000, 10000, true],
  ['wide-min', 1, 120, 0, 10000, 10000, false], ['high-min', 1, 0, 120, 10000, 10000, false],
  ['span-210', 1, 210, 210, 10000, 10000, false], ['mixed', 1, 120, 0, 160, 50, false],
] as const) effect('UIGridLayout', `grid-${name}`, d => {
  const child = d.root.children[0].children[0].children[1];
  const limit = strategy.createNode('UISizeConstraint'); limit.properties.MinSize = { x: minX, y: minY }; limit.properties.MaxSize = { x: maxX, y: maxY };
  const scaling = strategy.createNode('UIScale'); scaling.properties.Scale = scale; child.children.push(limit, scaling);
  if (first) child.properties.LayoutOrder = -1;
});
effect('UIGridLayout', 'grid-aspect', d => {
  const child = d.root.children[0].children[0].children[1], ratio = strategy.createNode('UIAspectRatioConstraint'); ratio.properties.AspectRatio = 2; child.children.push(ratio);
});
effect('UIGradient', 'color-alpha-interpolation', d => {
  const owner = d.root.children[0].children[0]; owner.properties.BackgroundColor3 = '#ed6a5a'; owner.properties.BackgroundTransparency = .3;
  owner.children[0].properties.TransparencyStart = 1; owner.children[0].properties.TransparencyEnd = 0;
});
effect('ImageLabel', 'image-gradient', d => {
  const image = d.root.children[0].children[0]; image.properties.Image = 'rbxasset://textures/ui/GuiImagePlaceholder.png'; image.properties.ImageColor3 = '#d84c72';
  image.previewImage = { name: 'GuiImagePlaceholder.png', dataUrl: placeholder }; image.children = [strategy.createNode('UIGradient')];
  image.children[0].properties.TransparencyStart = .2; image.children[0].properties.TransparencyEnd = .7;
});
for (const [name, width, height, canvasWidth, canvasHeight, x, y] of [
  ['both', 200, 100, 400, 400, 80, 60], ['vertical', 200, 100, 200, 400, 0, 80],
  ['horizontal', 200, 100, 400, 100, 80, 0], ['end', 200, 100, 400, 400, 10000, 10000],
  ['tiny-thumb', 200, 100, 400, 10000, 0, 600],
] as const) effect('ScrollingFrame', `scroll-${name}`, d => {
  const sc = d.root.children[0].children[0]; sc.properties.Size = dim2(width, height); sc.properties.CanvasSize = dim2(canvasWidth, canvasHeight); sc.properties.CanvasPosition = { x, y }; sc.properties.BackgroundColor3 = '#334455';
});
