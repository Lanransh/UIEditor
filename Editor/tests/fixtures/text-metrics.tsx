import { createRoot } from 'react-dom/client';
import { DocumentCanvas } from '../../src/editor/Canvas';
import { robloxStrategy as strategy } from '../../src/editor/roblox';
import type { DocumentEditor } from '../../src/editor/useDocumentEditor';
import { dim2 } from '../../src/shared/uiDocument';
import '../../src/styles.css';

const document = strategy.createDocument('TextMetrics');
function text(id: string, value: string, font: string, size: number, width = 500, height = 42, scaled = false, className = 'TextLabel') {
  const node = strategy.createNode(className);
  node.id = id; node.name = id;
  const index = document.root.children.length;
  Object.assign(node.properties, { Text: value, Font: font, TextSize: size, TextScaled: scaled, TextWrapped: false, TextXAlignment: 'Left', BackgroundTransparency: 1, TextColor3: '#ffffff', Position: dim2(30 + Math.floor(index / 13) * 600, 20 + index % 13 * 55), Size: dim2(width, height) });
  document.root.children.push(node);
  return node;
}

text('rebirth20', 'Rebirth', 'GothamBold', 20);
text('rebirth19', 'Rebirth', 'GothamBold', 19);
text('rebirth23', 'Rebirth', 'GothamBold', 23);
text('title19', 'REBIRTH', 'GothamBold', 19);
text('multiplier23', 'x5', 'GothamBold', 23);
text('wide', 'WWWWWW', 'GothamBold', 20, 140, 60, true);
text('narrow', 'iiiiii', 'GothamBold', 20, 140, 60, true);
const maximum = text('maximum', 'ii', 'GothamBold', 20, 140, 60, true);
const maximumConstraint = strategy.createNode('UITextSizeConstraint');
Object.assign(maximumConstraint.properties, { MinTextSize: 1, MaxTextSize: 18 });
maximum.children.push(maximumConstraint);
const minimum = text('minimum', 'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW', 'GothamBold', 20, 40, 20, true);
const minimumConstraint = strategy.createNode('UITextSizeConstraint');
Object.assign(minimumConstraint.properties, { MinTextSize: 16, MaxTextSize: 100 });
minimum.children.push(minimumConstraint);
const placeholder = text('placeholder', '', 'GothamBold', 20, 140, 60, true, 'TextBox');
placeholder.properties.PlaceholderText = 'WWWWWW';
text('gotham', 'Font preview', 'Gotham', 20);
text('sourceSans', 'Font preview', 'SourceSans', 20);
text('arial', 'Font preview', 'Arial', 20);
text('fractional', 'Rebirth', 'GothamBold', 23.8);
text('sourceSans20', 'Rebirth', 'SourceSans', 20);
text('arial20', 'Rebirth', 'Arial', 20);
text('gotham20', 'Rebirth', 'Gotham', 20);
text('rebirth40', 'Rebirth', 'GothamBold', 40);
text('rebirth100', 'Rebirth', 'GothamBold', 100, 500, 120).properties.Position = dim2(630, 550);
text('multiline', 'Rebirth\nRebirth', 'GothamBold', 20, 500, 60);
const unscaled = text('unscaledConstraint', 'Rebirth', 'GothamBold', 20);
const unscaledConstraint = strategy.createNode('UITextSizeConstraint');
Object.assign(unscaledConstraint.properties, { MinTextSize: 1, MaxTextSize: 12 });
unscaled.children.push(unscaledConstraint);

const editor = { strategy, document, imageAssets: [], selected: document.root, busy: false, runtime: { active: false, frame: null }, select: () => {}, execute: () => {} } as unknown as DocumentEditor;
window.document.body.innerHTML = '<style>#qa-root > .canvas { width:1400px; flex-shrink:0 } .canvas-hint { display:none }</style><div id="qa-root" style="height:850px;width:1400px;display:flex"></div>';
createRoot(window.document.getElementById('qa-root')!).render(<DocumentCanvas editor={editor} />);
